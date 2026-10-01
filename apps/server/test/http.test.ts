import type { PresenterDeckState } from '@pulse/shared';
import { newUuid } from '@pulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runRetention, scheduleRetention } from '../src/jobs/retention';
import { call, connectParticipant, connectPresenter, mcConfig, newDeck, next, startServer, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server.stop();
});

async function deckWithVotes() {
  const { deckId, deckSecret } = newDeck();
  const presenter = await connectPresenter(server.url, deckId, deckSecret);
  const deck = await next<PresenterDeckState>(presenter, 'deck:state');
  await call(presenter, 'deck:upsert', { settings: { ...deck.settings, title: 'Anatomie; "Teil 1"', qaEnabled: true } });
  const item = mcConfig(deckId, { prompt: 'Größe; "Herz"?' });
  await call(presenter, 'item:activate', { itemId: item.id, config: item });
  const p = await connectParticipant(server.url, deck.joinCode);
  await call(p, 'response:submit', { itemId: item.id, clientResponseId: newUuid(), payload: { type: 'multiple_choice', optionIds: ['a'] } });
  await call(p, 'qa:submit', { clientQaId: newUuid(), text: '=HYPERLINK("x")\nZeile 2' });
  return { deckId, presenter, p, item, deck };
}

describe('http', () => {
  it('healthz and join check', async () => {
    const health = await fetch(`${server.url}/healthz`);
    expect(await health.json()).toEqual({ ok: true, db: true });
    const { deck, presenter, p } = await deckWithVotes();
    expect(await (await fetch(`${server.url}/api/join/${deck.joinCode}`)).json()).toEqual({ exists: true });
    expect(await (await fetch(`${server.url}/api/join/000001`)).json()).toEqual({ exists: false });
    expect(await (await fetch(`${server.url}/api/join/abc`)).json()).toEqual({ exists: false });
    p.close();
    presenter.close();
  });

  it('dashboard: single-use entry token, session, exports, reset, delete', async () => {
    const { deckId, presenter, p, item } = await deckWithVotes();
    const tokenAck = await call<{ url: string }>(presenter, 'export:token', {});
    if (!tokenAck.ok) throw new Error('token');
    const entry = new URL(tokenAck.url).searchParams.get('t');
    expect(tokenAck.url.startsWith('https://pulse.test/dashboard?t=')).toBe(true);

    const exchange = (token: string | null) =>
      fetch(`${server.url}/api/dashboard/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    const first = await exchange(entry);
    expect(first.status).toBe(200);
    const { session } = (await first.json()) as { session: string };
    expect((await exchange(entry)).status).toBe(401); // single use

    const auth = { authorization: `Bearer ${session}` };
    const info = (await (await fetch(`${server.url}/api/dashboard`, { headers: auth })).json()) as {
      items: { id: string; responses: number }[];
      qa: { total: number };
    };
    expect(info.items).toEqual([expect.objectContaining({ id: item.id, responses: 1 })]);
    expect(info.qa.total).toBe(1);
    expect((await fetch(`${server.url}/api/dashboard`)).status).toBe(401);

    const csvRes = await fetch(`${server.url}/api/export/${deckId}.csv?t=${encodeURIComponent(session)}`);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    const bytes = new Uint8Array(await csvRes.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM
    const csv = new TextDecoder().decode(bytes.slice(3));
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('deck_title;slide_item_id;question_type;prompt;participant_ref;nickname;answer;points;response_ms;hidden;submitted_at');
    expect(lines[1]).toContain('"Anatomie; ""Teil 1""";');
    expect(lines[1]).toContain(';multiple_choice;"Größe; ""Herz""?";');
    expect(lines[1]).toMatch(/;Gut;;;false;\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+0[12]:00$/);
    expect(csv).toContain(`;qa;;`);
    expect(csv).toContain(`"'=HYPERLINK(""x"")\nZeile 2"`); // formula neutralised, newline quoted
    expect(csv.endsWith('\r\n')).toBe(true);
    expect((await fetch(`${server.url}/api/export/${deckId}.csv?t=nope`)).status).toBe(401);

    const xlsx = await fetch(`${server.url}/api/export/${deckId}.xlsx?t=${encodeURIComponent(session)}`);
    expect(xlsx.status).toBe(200);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsx.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', '1 Größe; "Herz"', 'Q&A']);
    expect(wb.getWorksheet('Summary')?.getRow(2).getCell(6).value).toContain('Gut: 1 (100 %)');

    const reset = await fetch(`${server.url}/api/dashboard/items/${item.id}/reset`, { method: 'POST', headers: auth });
    expect(reset.status).toBe(200);
    const after = (await (await fetch(`${server.url}/api/dashboard`, { headers: auth })).json()) as { items: { responses: number }[] };
    expect(after.items[0]?.responses).toBe(0);

    expect((await fetch(`${server.url}/api/dashboard/delete`, { method: 'POST', headers: auth })).status).toBe(200);
    const gone = (await (await fetch(`${server.url}/api/dashboard`, { headers: auth })).json()) as { items: unknown[]; qa: { total: number } };
    expect(gone.items).toEqual([]);
    expect(gone.qa.total).toBe(0);
    p.close();
    presenter.close();
  });

  it('retention deletes inactive decks with a fake clock', async () => {
    const { deckId, presenter, p } = await deckWithVotes();
    p.close();
    presenter.close();
    const store = server.pulse.store;
    expect(await store.getDeck(deckId)).not.toBeNull();
    const in89Days = new Date(Date.now() + 89 * 86_400_000);
    expect(await runRetention(store, in89Days, 90)).not.toContain(deckId);
    const in91Days = new Date(Date.now() + 91 * 86_400_000);

    let clock = new Date('2026-10-01T01:00:00Z'); // 03:00 in Vienna (CEST): too early
    const deleted: string[] = [];
    const job = scheduleRetention({
      store,
      retentionDays: 90,
      timeZone: 'Europe/Vienna',
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      onDeleted: (ids) => deleted.push(...ids),
      clock: () => clock,
      intervalMs: 3_600_000,
    });
    await job.tick();
    expect(deleted).toEqual([]);
    clock = new Date(in91Days.getTime());
    clock.setUTCHours(4, 0, 0, 0); // 05:00 or 06:00 in Vienna, after 03:30 either way
    await job.tick();
    expect(deleted).toContain(deckId);
    expect(await store.getDeck(deckId)).toBeNull();
    deleted.length = 0;
    await job.tick(); // once per day
    expect(deleted).toEqual([]);
    job.stop();
  });
});
