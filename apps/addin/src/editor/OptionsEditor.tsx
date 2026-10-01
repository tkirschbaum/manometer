import { newShortId, type Translate } from '@pulse/shared';
import { useState, type KeyboardEvent } from 'react';
import { CheckIcon, CrossIcon, GripIcon, PlusIcon } from '../ui/icons';
import { inputClass } from '../ui/controls';

interface Row {
  id: string;
  label: string;
}

/**
 * Editable list of options or statements: drag to reorder, Alt+↑/↓ in the field to move (§6.8),
 * optional "correct" marker (checkbox for multiple choice, radio for quiz).
 */
export function OptionsEditor({
  rows,
  onChange,
  min,
  max,
  maxLength,
  placeholderKey,
  addKey,
  removeKey,
  t,
  correct,
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  min: number;
  max: number;
  maxLength: number;
  placeholderKey: 'editor.optionPlaceholder' | 'editor.statementPlaceholder';
  addKey: 'editor.addOption' | 'editor.addStatement';
  removeKey: 'editor.removeOption' | 'editor.removeStatement';
  t: Translate;
  correct?: { mode: 'multi' | 'single'; ids: string[]; onChange: (ids: string[]) => void };
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const move = (from: number, to: number): void => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    if (row) next.splice(to, 0, row);
    onChange(next);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>, index: number): void => {
    if (!e.altKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, index - 1);
      requestAnimationFrame(() => document.getElementById(`opt-${rows[index]?.id ?? ''}`)?.focus());
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, index + 1);
      requestAnimationFrame(() => document.getElementById(`opt-${rows[index]?.id ?? ''}`)?.focus());
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex flex-col gap-1.5">
        {rows.map((row, index) => {
          const isCorrect = correct?.ids.includes(row.id) ?? false;
          return (
            <li
              key={row.id}
              className={`flex items-center gap-1.5 ${dragIndex === index ? 'opacity-50' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
              }}
            >
              <span
                draggable
                onDragStart={() => {
                  setDragIndex(index);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                }}
                className="cursor-grab text-muted"
                title={`${t('editor.moveUp')} / ${t('editor.moveDown')}: Alt+↑ / Alt+↓`}
                aria-hidden="true"
              >
                <GripIcon size={16} />
              </span>
              {correct ? (
                <button
                  type="button"
                  role={correct.mode === 'single' ? 'radio' : 'checkbox'}
                  aria-checked={isCorrect}
                  aria-label={`${t('editor.markCorrect')}: ${row.label || t(placeholderKey, { n: index + 1 })}`}
                  title={t('editor.markCorrect')}
                  onClick={() => {
                    if (correct.mode === 'single') correct.onChange([row.id]);
                    else correct.onChange(isCorrect ? correct.ids.filter((id) => id !== row.id) : [...correct.ids, row.id]);
                  }}
                  className={`flex size-6 shrink-0 items-center justify-center border ${correct.mode === 'single' ? 'rounded-full' : 'rounded-[4px]'} ${isCorrect ? 'border-navy bg-navy text-paper' : 'border-line text-transparent hover:border-navy'}`}
                >
                  <CheckIcon size={14} strokeWidth={3} />
                </button>
              ) : null}
              <input
                id={`opt-${row.id}`}
                value={row.label}
                maxLength={maxLength}
                placeholder={t(placeholderKey, { n: index + 1 })}
                aria-label={t(placeholderKey, { n: index + 1 })}
                onKeyDown={(e) => {
                  onKey(e, index);
                }}
                onChange={(e) => {
                  onChange(rows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r)));
                }}
                className={inputClass}
              />
              <button
                type="button"
                disabled={rows.length <= min}
                aria-label={t(removeKey, { n: index + 1 })}
                title={t(removeKey, { n: index + 1 })}
                onClick={() => {
                  onChange(rows.filter((r) => r.id !== row.id));
                  if (correct) correct.onChange(correct.ids.filter((id) => id !== row.id));
                }}
                className="flex size-7 shrink-0 items-center justify-center rounded-brand text-muted hover:bg-mist hover:text-navy disabled:opacity-30"
              >
                <CrossIcon size={16} />
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={rows.length >= max}
        onClick={() => {
          onChange([...rows, { id: newShortId(), label: '' }]);
        }}
        className="inline-flex items-center gap-1 self-start rounded-brand px-1.5 py-1 font-semibold text-navy hover:bg-mist disabled:opacity-40"
      >
        <PlusIcon size={16} />
        {t(addKey)}
      </button>
    </div>
  );
}
