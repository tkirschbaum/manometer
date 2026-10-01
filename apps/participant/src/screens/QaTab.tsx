import { LIMITS, plural } from '@pulse/shared';
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { ArrowUpIcon, CrossIcon } from '../components/icons';
import { useI18n } from '../lib/i18n';
import type { SessionController, SessionState } from '../lib/session';

type Sort = 'top' | 'new';

/** Audience Q&A (§7.2.5): ask, upvote, own questions marked, answered ones at the bottom. */
export function QaTab({ state, session }: { state: SessionState; session: SessionController }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [sort, setSort] = useState<Sort>('top');
  const queued = state.pending.filter((p) => p.kind === 'qa');

  const items = useMemo(() => {
    const sorted = [...state.qa].sort((a, b) =>
      sort === 'top' ? b.upvotes - a.upvotes || b.createdAt - a.createdAt : b.createdAt - a.createdAt,
    );
    return [...sorted.filter((q) => !q.answered), ...sorted.filter((q) => q.answered)];
  }, [state.qa, sort]);

  return (
    <section className="mt-3 flex flex-col">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value) return;
          session.qaSubmit(value);
          setText('');
        }}
      >
        <label htmlFor="qa-input" className="sr-only">
          {t('qa.placeholder')}
        </label>
        <textarea
          id="qa-input"
          rows={3}
          value={text}
          maxLength={LIMITS.qaMax}
          placeholder={t('qa.placeholder')}
          onChange={(e) => {
            setText(e.target.value);
          }}
          className="w-full resize-none rounded-brand border-2 border-line px-4 py-3 text-[18px] focus:border-navy focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-4">
          <span className="tabular text-[15px] text-muted" aria-live="polite">
            {t('text.counter', { n: text.length, max: LIMITS.qaMax })}
          </span>
          <Button type="submit" disabled={text.trim().length === 0}>
            {t('qa.submit')}
          </Button>
        </div>
        {queued.length > 0 ? <p className="mt-2 text-[15px] text-muted">{t('session.queued')}</p> : null}
        {state.error ? (
          <p role="alert" className="mt-2 flex items-center gap-2 text-[16px] font-semibold">
            <CrossIcon size={18} />
            {t(`error.${state.error}`)}
          </p>
        ) : null}
      </form>

      <div role="group" aria-label="Sortierung" className="mt-6 flex gap-2">
        {(['top', 'new'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={sort === s}
            onClick={() => {
              setSort(s);
            }}
            className={`min-h-11 rounded-brand border-2 px-4 text-[16px] font-semibold ${sort === s ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-navy'}`}
          >
            {s === 'top' ? t('qa.sortTop') : t('qa.sortNew')}
          </button>
        ))}
      </div>

      {items.length === 0 ? <p className="mt-6 text-[17px] text-muted">{t('qa.empty')}</p> : null}
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((q) => {
          const voted = state.qaVoted.has(q.id);
          const mine = state.qaMine.has(q.id);
          return (
            <li
              key={q.id}
              className={`fade-in flex gap-3 rounded-brand border border-line p-3 ${q.answered ? 'opacity-55' : ''}`}
            >
              <button
                type="button"
                aria-pressed={voted}
                aria-label={voted ? t('qa.removeVote') : t('qa.upvote')}
                onClick={() => {
                  session.qaVote(q.id, !voted);
                }}
                className={`tabular flex min-h-14 min-w-14 flex-col items-center justify-center rounded-brand border-2 text-[16px] font-bold ${voted ? 'border-navy bg-navy text-paper' : 'border-line text-navy hover:border-navy'}`}
              >
                <ArrowUpIcon size={18} strokeWidth={2.5} />
                {q.upvotes}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] break-words">{q.text}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-[14px] text-muted">
                  <span className="tabular">{plural(t, 'qa.votes', q.upvotes)}</span>
                  {mine ? <span className="font-semibold text-navy">{t('qa.mine')}</span> : null}
                  {q.answered ? <span>{t('qa.answered')}</span> : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
