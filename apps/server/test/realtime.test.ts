import type { ParticipantDeckState, PresenterDeckState, ResultsView } from '@pulse/shared';
import { newUuid } from '@pulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/client';
import {
  call,
  connectParticipant,
  connectPresenter,
  mcConfig,
  newDeck,
  next,
  sleep,
  startServer,
  testEnv,
  type TestServer,
} from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer({ timing: { activeGraceMs: 300, handoverMs: 400 } });
});

afterAll(async () => {
  await server.stop();
});

async function openDeck() {
  const { deckId, deckSecret } = newDeck();
  const presenter = await connectPresenter(server.url, deckId, deckSecret);
  const state = await next<PresenterDeckState>(presenter, 'deck:state');
  return { deckId, deckSecret, presenter, state };
}

describe('presenter namespace', () => {
  it('creates the deck on first connect and returns a join code', async () => {
    const { deckId, deckSecret, presenter, state } = await openDeck();
    expect(state.created).toBe(true);
    expect(state.joinCode).toMatch(/^\d{6}$/);
    expect(state.deckId).toBe(deckId);
    presenter.close();

    const again = await connectPresenter(server.url, deckId, deckSecret);
    const second = await next<PresenterDeckState>(again, 'deck:state');
    expect(second.created).toBe(false);
    expect(second.joinCode).toBe(state.joinCode);
    again.close();
  });

  it('rejects a wrong secret for an existing deck', async () => {
    const { deckId, presenter } = await openDeck();
    presenter.close();
    await expect(connectPresenter(server.url, deckId, newDeck().deckSecret)).rejects.toThrow('UNAUTHORIZED');
  });

  it('acks invalid payloads with INVALID_PAYLOAD', async () => {
    const { presenter } = await openDeck();
    const res = await call(presenter, 'item:upsert', { kind: 'nonsense' });
    expect(res).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
    presenter.close();
  });

  it('refuses items of another deck', async () => {
    const a = await openDeck();
    const b = await openDeck();
    const item = mcConfig(a.deckId);
    expect((await call(a.presenter, 'item:upsert', item)).ok).toBe(true);
    const hijack = await call(b.presenter, 'item:upsert', { ...item, deckId: b.deckId });
    expect(hijack).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    a.presenter.close();
    b.presenter.close();
  });
});

describe('multiple choice flow', () => {
  it('3 participants vote, presenter receives the aggregate, duplicates are rejected, retries are idempotent', async () => {
    const { deckId, presenter, state } = await openDeck();
    const item = mcConfig(deckId);
    const activated = await call(presenter, 'item:activate', { itemId: item.id, config: item });
    expect(activated.ok).toBe(true);

    const voters = await Promise.all([1, 2, 3].map(() => connectParticipant(server.url, state.joinCode)));
    const states = await Promise.all(voters.map((v) => next<ParticipantDeckState>(v, 'deck:state')));
    for (const s of states) {
      expect(s.activeItem?.id).toBe(item.id);
      expect(s.activeItem?.state).toBe('open');
    }

    const results = next<ResultsView>(presenter, 'results:update', (r) => r.itemId === item.id && r.respondents === 3);
    const choices = ['a', 'a', 'c'];
    const ids = voters.map(() => newUuid());
    const acks = await Promise.all(
      voters.map((v, i) =>
        call(v, 'response:submit', {
          itemId: item.id,
          clientResponseId: ids[i],
          payload: { type: 'multiple_choice', optionIds: [choices[i]] },
        }),
      ),
    );
    for (const ack of acks) expect(ack.ok).toBe(true);
    const view = await results;
    expect(view.type).toBe('multiple_choice');
    if (view.type === 'multiple_choice') expect(view.counts).toEqual({ a: 2, b: 0, c: 1 });

    // Second vote with a new id -> rejected
    const dup = await call(voters[0]!, 'response:submit', {
      itemId: item.id,
      clientResponseId: newUuid(),
      payload: { type: 'multiple_choice', optionIds: ['b'] },
    });
    expect(dup).toEqual({ ok: false, error: 'ALREADY_ANSWERED' });

    // Same clientResponseId again -> ok, no double count
    const retry = await call<{ mine: { submissions: unknown[] } }>(voters[0]!, 'response:submit', {
      itemId: item.id,
      clientResponseId: ids[0],
      payload: { type: 'multiple_choice', optionIds: ['a'] },
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.mine.submissions).toHaveLength(1);
    const snapshot = await call<{ results: ResultsView }>(presenter, 'item:upsert', item);
    if (snapshot.ok && snapshot.results.type === 'multiple_choice') expect(snapshot.results.counts.a).toBe(2);

    // Unknown option and too many options -> invalid
    const bad = await call(voters[1]!, 'response:submit', {
      itemId: item.id,
      clientResponseId: newUuid(),
      payload: { type: 'multiple_choice', optionIds: ['zz'] },
    });
    expect(bad.ok).toBe(false);

    for (const v of voters) v.close();
    presenter.close();
  });

  it('never sends correct answers before reveal and rejects answers after close', async () => {
    const { deckId, presenter, state } = await openDeck();
    const item = mcConfig(deckId, { correctOptionIds: ['b'] });
    await call(presenter, 'item:activate', { itemId: item.id, config: item });
    const p = await connectParticipant(server.url, state.joinCode);
    const s = await next<ParticipantDeckState>(p, 'deck:state');
    expect(s.activeItem?.correctOptionIds).toBeNull();
    expect(JSON.stringify(s)).not.toContain('correctOptionIds":["b"]');

    const revealed = next<ParticipantDeckState>(p, 'deck:state', (x) => x.activeItem?.revealed === true);
    await call(presenter, 'item:reveal', { itemId: item.id });
    expect((await revealed).activeItem?.correctOptionIds).toEqual(['b']);

    await call(presenter, 'item:close', { itemId: item.id });
    const late = await call(p, 'response:submit', {
      itemId: item.id,
      clientResponseId: newUuid(),
      payload: { type: 'multiple_choice', optionIds: ['a'] },
    });
    expect(late).toEqual({ ok: false, error: 'CLOSED' });
    p.close();
    presenter.close();
  });
});

describe('activation', () => {
  it("a late deactivate from A does not clear B's activation", async () => {
    const { deckId, deckSecret, presenter: a, state } = await openDeck();
    const b = await connectPresenter(server.url, deckId, deckSecret);
    const item1 = mcConfig(deckId);
    const item2 = mcConfig(deckId);
    await call(a, 'item:activate', { itemId: item1.id, config: item1 });
    await call(b, 'item:activate', { itemId: item2.id, config: item2 });
    await call(a, 'item:deactivate', { itemId: item1.id });
    const p = await connectParticipant(server.url, state.joinCode);
    const s = await next<ParticipantDeckState>(p, 'deck:state');
    expect(s.activeItem?.id).toBe(item2.id);

    // B's own deactivate clears it
    const waiting = next<ParticipantDeckState>(p, 'deck:state', (x) => x.activeItem === null);
    await call(b, 'item:deactivate', { itemId: item2.id });
    expect((await waiting).activeItem).toBeNull();
    p.close();
    a.close();
    b.close();
  });

  it('moving to the next Pulse slide switches phones directly, without the waiting screen in between', async () => {
    const { deckId, deckSecret, presenter: a, state } = await openDeck();
    const b = await connectPresenter(server.url, deckId, deckSecret);
    const item1 = mcConfig(deckId);
    const item2 = mcConfig(deckId);
    await call(a, 'item:activate', { itemId: item1.id, config: item1 });
    const p = await connectParticipant(server.url, state.joinCode);
    expect((await next<ParticipantDeckState>(p, 'deck:state')).activeItem?.id).toBe(item1.id);
    const seen: (string | null)[] = [];
    p.on('deck:state', (s: ParticipantDeckState) => seen.push(s.activeItem?.id ?? null));
    // Slide 1 is left first; slide 2's frame needs a moment to load before it activates.
    await call(a, 'item:deactivate', { itemId: item1.id });
    await sleep(150);
    await call(b, 'item:activate', { itemId: item2.id, config: item2 });
    await sleep(600);
    expect(seen).not.toContain(null);
    expect(seen.at(-1)).toBe(item2.id);
    p.close();
    a.close();
    b.close();
  });

  it('a normal slide after a Pulse slide shows the waiting screen after the handover window', async () => {
    const { deckId, presenter, state } = await openDeck();
    const item = mcConfig(deckId);
    await call(presenter, 'item:activate', { itemId: item.id, config: item });
    const p = await connectParticipant(server.url, state.joinCode);
    await next<ParticipantDeckState>(p, 'deck:state');
    const started = Date.now();
    const waiting = next<ParticipantDeckState>(p, 'deck:state', (x) => x.activeItem === null);
    await call(presenter, 'item:deactivate', { itemId: item.id });
    expect((await waiting).activeItem).toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(350);
    p.close();
    presenter.close();
  });

  it('clears the active item after the grace period when the presenter disconnects', async () => {
    const { deckId, presenter, state } = await openDeck();
    const item = mcConfig(deckId);
    await call(presenter, 'item:activate', { itemId: item.id, config: item });
    const p = await connectParticipant(server.url, state.joinCode);
    await next<ParticipantDeckState>(p, 'deck:state');
    const waiting = next<ParticipantDeckState>(p, 'deck:state', (x) => x.activeItem === null, 3000);
    presenter.close();
    expect((await waiting).activeItem).toBeNull();
    p.close();
  });

  it('rejects unknown join codes', async () => {
    await expect(connectParticipant(server.url, '000001')).rejects.toThrow('DECK_NOT_FOUND');
  });
});

describe('word cloud, open text, scale', () => {
  it('normalises and groups words, enforces entry limits, hides groups', async () => {
    const { deckId, presenter, state } = await openDeck();
    const item = { ...mcConfig(deckId), type: 'word_cloud', entriesPerParticipant: 3 } as unknown as ReturnType<
      typeof mcConfig
    >;
    delete (item as Record<string, unknown>).options;
    delete (item as Record<string, unknown>).allowMultiple;
    await call(presenter, 'item:activate', { itemId: item.id, config: item });
    const p1 = await connectParticipant(server.url, state.joinCode);
    const p2 = await connectParticipant(server.url, state.joinCode);
    const send = (p: typeof p1, text: string) =>
      call(p, 'response:submit', {
        itemId: item.id,
        clientResponseId: newUuid(),
        payload: { type: 'word_cloud', text },
      });
    expect((await send(p1, '  Straße! ')).ok).toBe(true);
    expect((await send(p1, 'straße')).ok).toBe(true);
    expect((await send(p1, 'Strasse')).ok).toBe(true);
    expect(await send(p1, 'viertes')).toEqual({ ok: false, error: 'LIMIT_REACHED' });
    expect(await send(p2, '!!!')).toEqual({ ok: false, error: 'EMPTY_AFTER_NORMALISATION' });
    expect(await send(p2, 'x'.repeat(26))).toEqual({ ok: false, error: 'EMPTY_AFTER_NORMALISATION' });
    const results = next<ResultsView>(presenter, 'results:update', (r) => r.type === 'word_cloud' && r.responses === 4);
    expect((await send(p2, 'Straße')).ok).toBe(true);
    const view = await results;
    if (view.type !== 'word_cloud') throw new Error('type');
    expect(view.words[0]).toEqual({ key: 'straße', text: 'Straße', count: 3 });
    expect(view.words[1]).toMatchObject({ key: 'strasse', count: 1 });

    const hidden = next<ResultsView>(presenter, 'results:update', (r) => r.type === 'word_cloud' && r.responses === 1);
    expect((await call(presenter, 'response:hide', { itemId: item.id, wordKey: 'straße' })).ok).toBe(true);
    const after = await hidden;
    if (after.type === 'word_cloud') expect(after.words.map((w) => w.key)).toEqual(['strasse']);
    p1.close();
    p2.close();
    presenter.close();
  });

  it('scale requires every statement in range', async () => {
    const { deckId, presenter, state } = await openDeck();
    const item = {
      id: newUuid(),
      deckId,
      schemaVersion: 1,
      kind: 'question',
      type: 'scale',
      prompt: 'Wie sehr stimmen Sie zu?',
      statements: [
        { id: 's1', label: 'Verständlich' },
        { id: 's2', label: 'Spannend' },
      ],
      range: 5,
    };
    await call(presenter, 'item:activate', { itemId: item.id, config: item });
    const p = await connectParticipant(server.url, state.joinCode);
    const submit = (ratings: Record<string, number>) =>
      call(p, 'response:submit', { itemId: item.id, clientResponseId: newUuid(), payload: { type: 'scale', ratings } });
    expect((await submit({ s1: 4 })).ok).toBe(false);
    expect((await submit({ s1: 6, s2: 1 })).ok).toBe(false);
    const results = next<ResultsView>(presenter, 'results:update', (r) => r.type === 'scale' && r.respondents === 1);
    expect((await submit({ s1: 4, s2: 2 })).ok).toBe(true);
    const view = await results;
    if (view.type === 'scale') {
      expect(view.statements[0]).toMatchObject({ id: 's1', n: 1, average: 4, histogram: [0, 0, 0, 1, 0] });
    }
    p.close();
    presenter.close();
  });
});

describe('Q&A', () => {
  it('submits questions, keeps upvotes consistent, needs Q&A to be enabled', async () => {
    const { presenter, state } = await openDeck();
    const p1 = await connectParticipant(server.url, state.joinCode);
    const p2 = await connectParticipant(server.url, state.joinCode);
    const qaId = newUuid();
    expect(await call(p1, 'qa:submit', { clientQaId: qaId, text: 'Kommt das zur Prüfung?' })).toEqual({
      ok: false,
      error: 'CLOSED',
    });
    await call(presenter, 'deck:upsert', { settings: { ...state.settings, qaEnabled: true } });
    expect((await call(p1, 'qa:submit', { clientQaId: qaId, text: 'Kommt das zur Prüfung?' })).ok).toBe(true);
    // idempotent retry
    expect((await call(p1, 'qa:submit', { clientQaId: qaId, text: 'Kommt das zur Prüfung?' })).ok).toBe(true);
    const updated = next<{ items: { id: string; upvotes: number }[] }>(
      p1,
      'qa:update',
      (l) => l.items[0]?.upvotes === 2,
    );
    await call(p1, 'qa:upvote', { qaItemId: qaId });
    await call(p2, 'qa:upvote', { qaItemId: qaId });
    await call(p2, 'qa:upvote', { qaItemId: qaId });
    const list = await updated;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.upvotes).toBe(2);
    const down = next<{ items: { upvotes: number }[] }>(p2, 'qa:update', (l) => l.items[0]?.upvotes === 1);
    await call(p2, 'qa:unvote', { qaItemId: qaId });
    expect((await down).items[0]?.upvotes).toBe(1);
    const gone = next<{ items: unknown[] }>(p2, 'qa:update', (l) => l.items.length === 0);
    await call(presenter, 'qa:hide', { qaItemId: qaId });
    await gone;
    p1.close();
    p2.close();
    presenter.close();
  });
});

describe('restart', () => {
  it('recovers responses and the active item after the server restarts', async () => {
    const env = testEnv();
    const database = await createDatabase(env);
    let local = await startServer({ database });
    const { deckId, deckSecret } = newDeck();
    const presenter = await connectPresenter(local.url, deckId, deckSecret);
    const state = await next<PresenterDeckState>(presenter, 'deck:state');
    const item = mcConfig(deckId);
    await call(presenter, 'item:activate', { itemId: item.id, config: item });
    const pid = newUuid();
    const voter = await connectParticipant(local.url, state.joinCode, pid);
    await call(voter, 'response:submit', {
      itemId: item.id,
      clientResponseId: newUuid(),
      payload: { type: 'multiple_choice', optionIds: ['b'] },
    });
    presenter.close();
    voter.close();
    await local.pulse.close();

    local = await startServer({ database });
    const back = await connectParticipant(local.url, state.joinCode, pid);
    const s = await next<ParticipantDeckState>(back, 'deck:state');
    expect(s.activeItem?.id).toBe(item.id);
    const mine = await call<{ mine: { submissions: unknown[] } }>(back, 'item:mine', { itemId: item.id });
    expect(mine.ok && mine.mine.submissions).toHaveLength(1);
    const presenter2 = await connectPresenter(local.url, deckId, deckSecret);
    const snap = await call<{ results: ResultsView }>(presenter2, 'item:activate', { itemId: item.id, config: item });
    expect(snap.ok && snap.results.respondents).toBe(1);
    back.close();
    presenter2.close();
    await local.pulse.close();
    await database.close();
    await sleep(50);
  });
});
