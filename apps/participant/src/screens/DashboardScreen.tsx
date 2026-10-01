import { formatJoinCode, type MessageKey } from '@pulse/shared';
import { useCallback, useEffect, useState } from 'react';
import * as z from 'zod/mini';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Shell } from '../components/Shell';
import { useI18n } from '../lib/i18n';

const SESSION_KEY = 'pulse.dashboard.session';

const dashboardSchema = z.object({
  deck: z.object({ id: z.string(), title: z.string(), joinCode: z.string() }),
  participants: z.number(),
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      type: z.nullable(z.string()),
      prompt: z.string(),
      respondents: z.number(),
      responses: z.number(),
    }),
  ),
  qa: z.object({ total: z.number(), hidden: z.number() }),
});
type Dashboard = z.output<typeof dashboardSchema>;

type Status = { kind: 'loading' } | { kind: 'expired' } | { kind: 'ready'; data: Dashboard } | { kind: 'deleted' };

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(value: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, value);
  } catch {
    // ignore
  }
}

/** Presenter dashboard (§5.7): items with counts, exports, reset, delete. Opened from the add-in with a one-time token. */
export function DashboardScreen() {
  const { t } = useI18n();
  const [session, setSession] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [confirm, setConfirm] = useState<{ kind: 'reset'; itemId: string } | { kind: 'delete' } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (token: string) => {
    const res = await fetch('/api/dashboard', { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setStatus({ kind: 'expired' });
      return;
    }
    const parsed = dashboardSchema.safeParse(await res.json());
    setStatus(parsed.success ? { kind: 'ready', data: parsed.data } : { kind: 'expired' });
  }, []);

  useEffect(() => {
    const entry = new URLSearchParams(window.location.search).get('t');
    // Remove the token from the address bar and history right away.
    window.history.replaceState(null, '', '/dashboard');
    const start = async (): Promise<void> => {
      let token = readSession();
      if (entry) {
        const res = await fetch('/api/dashboard/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: entry }),
        });
        const body = (await res.json().catch(() => ({}))) as { session?: string };
        if (res.ok && body.session) {
          token = body.session;
          writeSession(token);
        }
      }
      if (!token) {
        setStatus({ kind: 'expired' });
        return;
      }
      setSession(token);
      await load(token);
    };
    start().catch(() => {
      setStatus({ kind: 'expired' });
    });
  }, [load]);

  const act = async (): Promise<void> => {
    if (!confirm || !session) return;
    const path = confirm.kind === 'reset' ? `/api/dashboard/items/${confirm.itemId}/reset` : '/api/dashboard/delete';
    const res = await fetch(path, { method: 'POST', headers: { authorization: `Bearer ${session}` } });
    setConfirm(null);
    if (!res.ok) {
      setStatus({ kind: 'expired' });
      return;
    }
    if (confirm.kind === 'delete') {
      setNotice(t('dashboard.deleted'));
      await load(session);
    } else {
      setNotice(t('dashboard.resetDone'));
      await load(session);
    }
  };

  return (
    <Shell title={status.kind === 'ready' ? status.data.deck.title : null}>
      <h1 className="mt-4 text-[28px] font-bold text-navy">{t('dashboard.title')}</h1>
      {status.kind === 'loading' ? <p className="mt-6 text-muted">{t('dashboard.loading')}</p> : null}
      {status.kind === 'expired' ? <p className="mt-6 text-[18px] font-semibold">{t('dashboard.expired')}</p> : null}
      {status.kind === 'ready' && session ? (
        <>
          <p className="tabular mt-2 text-[17px] text-muted">
            {t('dashboard.code', { code: formatJoinCode(status.data.deck.joinCode) })}
            {status.data.participants > 0 ? `, ${status.data.participants} ${t('dashboard.people')}` : ''}
          </p>
          {notice ? (
            <p role="status" className="mt-4 rounded-brand bg-mist px-4 py-3 text-[16px] font-semibold">
              {notice}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              className="inline-flex min-h-12 items-center rounded-brand border-2 border-navy bg-navy px-5 text-[18px] font-semibold text-paper hover:bg-navy-soft"
              href={`/api/export/${status.data.deck.id}.csv?t=${encodeURIComponent(session)}`}
              download
            >
              {t('dashboard.exportCsv')}
            </a>
            <a
              className="inline-flex min-h-12 items-center rounded-brand border-2 border-navy px-5 text-[18px] font-semibold text-navy hover:bg-mist"
              href={`/api/export/${status.data.deck.id}.xlsx?t=${encodeURIComponent(session)}`}
              download
            >
              {t('dashboard.exportXlsx')}
            </a>
          </div>

          {status.data.items.length === 0 ? (
            <p className="mt-8 text-muted">{t('dashboard.noItems')}</p>
          ) : (
            <ol className="mt-8 flex flex-col divide-y divide-line border-y border-line">
              {status.data.items.map((item, index) => (
                <li key={item.id} className="flex items-start gap-3 py-4">
                  <span className="tabular w-6 shrink-0 pt-0.5 text-[16px] text-muted">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-muted">{t(`type.${item.type ?? item.kind}` as MessageKey)}</p>
                    <p className="text-[17px] break-words">{item.prompt}</p>
                    <p className="tabular mt-1 text-[15px] text-muted">
                      {item.responses} {t('dashboard.responses')}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={item.responses === 0}
                    onClick={() => {
                      setConfirm({ kind: 'reset', itemId: item.id });
                    }}
                  >
                    {t('dashboard.reset')}
                  </Button>
                </li>
              ))}
            </ol>
          )}
          <p className="tabular mt-6 text-[16px] text-muted">
            {t('dashboard.qa')}: {status.data.qa.total}
          </p>
          <div className="mt-10 border-t border-line pt-6">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirm({ kind: 'delete' });
              }}
            >
              {t('dashboard.deleteAll')}
            </Button>
          </div>
        </>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'delete' ? t('dashboard.confirmDelete.title') : t('editor.confirmReset.title')}
        body={confirm?.kind === 'delete' ? t('dashboard.confirmDelete.body') : t('editor.confirmReset.body')}
        confirmLabel={confirm?.kind === 'delete' ? t('dashboard.confirmDelete.confirm') : t('editor.confirmReset.confirm')}
        onConfirm={() => void act()}
        onCancel={() => {
          setConfirm(null);
        }}
      />
    </Shell>
  );
}
