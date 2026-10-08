import { LIMITS, type PublicItemView, type ResponsePayload } from '@pulse/shared';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '../components/Button';
import { StickyAction } from '../components/Shell';
import { CheckIcon } from '../components/icons';
import { useI18n } from '../lib/i18n';

interface InputProps {
  item: PublicItemView;
  onSubmit: (payload: ResponsePayload) => void;
  disabled?: boolean;
}

function SendBar({ disabled }: { disabled: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {/* Pushes the action to the bottom of the screen when the content is short. */}
      <div className="flex-1" />
      <StickyAction>
        <Button type="submit" className="w-full" disabled={disabled}>
          {t('session.send')}
        </Button>
      </StickyAction>
    </>
  );
}

export function MultipleChoiceInput({ item, onSubmit, disabled = false }: InputProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const max = item.allowMultiple ? (item.maxSelections ?? item.options.length) : 1;
  const toggle = (id: string): void => {
    if (!item.allowMultiple) {
      setSelected([id]);
      return;
    }
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : current.length < max ? [...current, id] : current,
    );
  };
  const submit = (e: SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (selected.length > 0) onSubmit({ type: 'multiple_choice', optionIds: selected });
  };
  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <p className="text-[16px] text-muted" id="mc-hint">
        {item.allowMultiple ? t('mc.chooseUpTo', { n: max }) : t('mc.chooseOne')}
      </p>
      <div
        role={item.allowMultiple ? 'group' : 'radiogroup'}
        aria-describedby="mc-hint"
        className="mt-3 flex flex-col gap-2.5"
      >
        {item.options.map((option) => {
          const on = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role={item.allowMultiple ? 'checkbox' : 'radio'}
              aria-checked={on}
              onClick={() => {
                toggle(option.id);
              }}
              className={`flex min-h-15 w-full items-center gap-3 rounded-brand border-2 px-4 py-3 text-left text-[18px] font-semibold transition-[background-color,border-color,transform] active:scale-[0.99] ${on ? 'border-primary bg-primary-soft text-ink' : 'border-line bg-paper text-ink hover:border-primary/60'}`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center border-2 transition-colors ${item.allowMultiple ? 'rounded-[7px]' : 'rounded-full'} ${on ? 'border-primary bg-primary text-paper' : 'border-[#c9cee0] bg-paper'}`}
                aria-hidden="true"
              >
                {on ? <CheckIcon size={16} strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 break-words">{option.label}</span>
            </button>
          );
        })}
      </div>
      <SendBar disabled={disabled || selected.length === 0} />
    </form>
  );
}

export function WordCloudInput({ item, onSubmit, disabled = false, used }: InputProps & { used: number }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const valid = text.trim().length > 0 && Array.from(text.trim()).length <= LIMITS.wordMax;
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({ type: 'word_cloud', text: text.trim() });
        setText('');
      }}
    >
      <label htmlFor="wc-input" className="sr-only">
        {t('wc.placeholder')}
      </label>
      <input
        id="wc-input"
        value={text}
        maxLength={LIMITS.wordMax}
        autoComplete="off"
        enterKeyHint="send"
        placeholder={t('wc.placeholder')}
        onChange={(e) => {
          setText(e.target.value);
        }}
        className="w-full rounded-brand border-2 border-transparent bg-mist px-4 py-3.5 text-[20px] font-semibold transition-colors focus:border-primary focus:bg-paper focus:outline-none"
      />
      <div className="tabular mt-2 flex justify-between text-[15px] text-muted">
        <span>{t('wc.remaining', { n: item.entriesPerParticipant - used, total: item.entriesPerParticipant })}</span>
        <span>{t('text.counter', { n: Array.from(text).length, max: LIMITS.wordMax })}</span>
      </div>
      <SendBar disabled={disabled || !valid} />
    </form>
  );
}

export function OpenTextInput({ onSubmit, disabled = false }: InputProps) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const valid = text.trim().length > 0 && text.length <= LIMITS.textMax;
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({ type: 'open_text', text: text.trim() });
        setText('');
      }}
    >
      <label htmlFor="ot-input" className="sr-only">
        {t('text.placeholder')}
      </label>
      <textarea
        id="ot-input"
        value={text}
        rows={5}
        maxLength={LIMITS.textMax}
        placeholder={t('text.placeholder')}
        onChange={(e) => {
          setText(e.target.value);
        }}
        className="w-full resize-none rounded-brand border-2 border-transparent bg-mist px-4 py-3 text-[18px] transition-colors focus:border-primary focus:bg-paper focus:outline-none"
      />
      <p className="tabular mt-2 text-right text-[15px] text-muted" aria-live="polite">
        {t('text.counter', { n: text.length, max: LIMITS.textMax })}
      </p>
      <SendBar disabled={disabled || !valid} />
    </form>
  );
}

export function ScaleInput({ item, onSubmit, disabled = false }: InputProps) {
  const { t } = useI18n();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const complete = item.statements.every((s) => ratings[s.id] !== undefined);
  const values = Array.from({ length: item.range }, (_, i) => i + 1);
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) onSubmit({ type: 'scale', ratings });
      }}
    >
      <p className="text-[16px] text-muted">{t('scale.instruction', { range: item.range })}</p>
      <div className="mt-4 flex flex-col gap-7">
        {item.statements.map((statement) => (
          <fieldset key={statement.id}>
            <legend className="text-[18px] font-bold text-ink">{statement.label}</legend>
            {/* 5 per row: 1–5 in one row, 1–10 in two rows, every target at least 48 px wide. */}
            <div className="mt-3 grid grid-cols-5 gap-2">
              {values.map((v) => {
                const on = ratings[statement.id] === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${statement.label}: ${v}`}
                    onClick={() => {
                      setRatings((r) => ({ ...r, [statement.id]: v }));
                    }}
                    className={`tabular min-h-12 rounded-xl border-2 text-[18px] font-bold transition-colors ${on ? 'border-primary bg-primary text-paper' : 'border-line bg-paper text-ink hover:border-primary/60'}`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
            {item.minLabel || item.maxLabel ? (
              <div className="mt-1.5 flex justify-between gap-4 text-[14px] text-muted">
                <span>{item.minLabel}</span>
                <span className="text-right">{item.maxLabel}</span>
              </div>
            ) : null}
          </fieldset>
        ))}
      </div>
      {!complete ? <p className="mt-4 text-[15px] text-muted">{t('scale.rateAll')}</p> : null}
      <SendBar disabled={disabled || !complete} />
    </form>
  );
}

/** Human-readable form of a submitted answer. */
export function describeAnswer(item: PublicItemView, payload: ResponsePayload): string {
  switch (payload.type) {
    case 'multiple_choice':
      return payload.optionIds.map((id) => item.options.find((o) => o.id === id)?.label ?? id).join(', ');
    case 'quiz':
      return item.options.find((o) => o.id === payload.optionId)?.label ?? payload.optionId;
    case 'word_cloud':
    case 'open_text':
      return payload.text;
    case 'scale':
      return item.statements.map((s) => `${s.label}: ${payload.ratings[s.id] ?? '–'}`).join('; ');
  }
}
