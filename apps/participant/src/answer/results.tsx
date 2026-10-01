import { formatNumber, formatPercent, type PublicItemView, type ResultsView } from '@pulse/shared';
import { useI18n } from '../lib/i18n';
import { CheckIcon } from '../components/icons';

/** Results on the phone (only when the presenter enabled "showOnPhone", §5.4). */
export function PhoneResults({ item, results }: { item: PublicItemView; results: ResultsView }) {
  const { t, language } = useI18n();
  return (
    <section className="mt-8 border-t border-line pt-5" aria-label={t('session.resultsTitle')}>
      <h2 className="text-[16px] font-semibold text-muted">{t('session.resultsTitle')}</h2>
      {results.type === 'multiple_choice' ? (
        <ul className="mt-3 flex flex-col gap-3">
          {item.options.map((o) => {
            const n = results.counts[o.id] ?? 0;
            const pct = results.respondents > 0 ? (n / results.respondents) * 100 : 0;
            const correct = item.correctOptionIds?.includes(o.id) ?? false;
            return (
              <li key={o.id}>
                <div className="flex justify-between gap-3 text-[16px]">
                  <span className="flex items-center gap-1.5">
                    {correct ? <CheckIcon size={18} className="text-navy" aria-label={t('stage.correct')} /> : null}
                    {o.label}
                  </span>
                  <span className="tabular text-muted">
                    {formatNumber(n, language)} ({formatPercent(n, results.respondents, language)})
                  </span>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-mist">
                  <div className="h-2.5 rounded-full bg-navy transition-[width] duration-400 ease-out" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {results.type === 'word_cloud' ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {results.words.slice(0, 20).map((w, i) => (
            <li key={w.key} className={i === 0 ? 'text-[22px] font-bold text-navy' : 'text-[17px] text-ink'}>
              {w.text} <span className="tabular text-[14px] text-muted">{w.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {results.type === 'open_text' ? (
        <ul className="mt-3 flex flex-col gap-2">
          {results.entries.slice(0, 10).map((e) => (
            <li key={e.id} className="rounded-brand bg-mist px-3 py-2 text-[16px] break-words">
              {e.text}
            </li>
          ))}
        </ul>
      ) : null}
      {results.type === 'scale' ? (
        <ul className="mt-3 flex flex-col gap-2">
          {results.statements.map((s) => (
            <li key={s.id} className="flex justify-between gap-3 text-[16px]">
              <span>{item.statements.find((x) => x.id === s.id)?.label}</span>
              <span className="tabular font-semibold text-navy">
                {s.average === null ? '–' : t('stage.average', { value: formatNumber(s.average, language, 1) })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
