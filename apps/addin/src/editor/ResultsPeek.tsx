import { plural, type ResultsView, type Translate } from '@pulse/shared';
import { EyeOffIcon } from '../ui/icons';

/** Response count and, for open text and word clouds, the latest entries with a hide button (moderation, §4.2). */
export function ResultsPeek({
  results,
  t,
  onHideResponse,
  onHideWord,
}: {
  results: ResultsView | null;
  t: Translate;
  onHideResponse: (id: string) => void;
  onHideWord: (key: string) => void;
}) {
  if (!results) return null;
  const items =
    results.type === 'open_text'
      ? results.entries.slice(0, 8).map((e) => ({
          key: e.id,
          text: e.text,
          hide: () => {
            onHideResponse(e.id);
          },
        }))
      : results.type === 'word_cloud'
        ? results.words.slice(0, 12).map((w) => ({
            key: w.key,
            text: `${w.text} (${w.count})`,
            hide: () => {
              onHideWord(w.key);
            },
          }))
        : [];
  return (
    <section className="border-t border-line pt-3">
      <p className="tabular font-semibold text-ink">{plural(t, 'editor.responses', results.responses)}</p>
      {items.length > 0 ? (
        <>
          <h3 className="mt-2 text-[12px] font-semibold text-muted">{t('editor.recentResponses')}</h3>
          <ul className="mt-1 flex flex-col">
            {items.map((item) => (
              <li key={item.key} className="group flex items-center justify-between gap-2 border-b border-mist py-1">
                <span className="min-w-0 truncate">{item.text}</span>
                <button
                  type="button"
                  onClick={item.hide}
                  title={t('stage.hide')}
                  aria-label={`${t('stage.hide')}: ${item.text}`}
                  className="flex shrink-0 items-center gap-1 rounded-brand px-1.5 py-0.5 text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-mist hover:text-primary focus:opacity-100"
                >
                  <EyeOffIcon size={14} />
                  {t('stage.hide')}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
