import { newShortId, type Translate } from '@pulse/shared';
import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { CheckIcon, CrossIcon, GripIcon, PlusIcon } from '../ui/icons';
import { insertLines, splitPastedList } from '../model/pasteList';
import { inputClass } from '../ui/controls';

interface Row {
  id: string;
  label: string;
}

const focusRow = (id: string | undefined, atEnd = false): void => {
  requestAnimationFrame(() => {
    const el = document.getElementById(`opt-${id ?? ''}`);
    if (!(el instanceof HTMLInputElement)) return;
    el.focus();
    if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
  });
};

/**
 * Editable list of options or statements: drag to reorder, Alt+↑/↓ in the field to move (§6.8),
 * optional "correct" marker (checkbox for multiple choice, radio for quiz).
 * Typing shortcuts: Enter goes to the next answer (adds one at the end), Backspace in an empty answer removes it,
 * pasting several lines fills several answers.
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
    const row = rows[index];
    if (e.key === 'Enter' && !e.altKey && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const following = rows[index + 1];
      if (following) focusRow(following.id);
      else if (rows.length < max && row && row.label.trim() !== '') {
        const added = { id: newShortId(), label: '' };
        onChange([...rows, added]);
        focusRow(added.id);
      }
      return;
    }
    if (e.key === 'Backspace' && row?.label === '' && rows.length > min) {
      e.preventDefault();
      onChange(rows.filter((r) => r.id !== row.id));
      if (correct) correct.onChange(correct.ids.filter((id) => id !== row.id));
      focusRow(rows[index - 1]?.id ?? rows[index + 1]?.id, true);
      return;
    }
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
                    else
                      correct.onChange(
                        isCorrect ? correct.ids.filter((id) => id !== row.id) : [...correct.ids, row.id],
                      );
                  }}
                  className={`flex size-6 shrink-0 items-center justify-center border ${correct.mode === 'single' ? 'rounded-full' : 'rounded-[4px]'} ${isCorrect ? 'border-primary bg-primary text-paper' : 'border-line text-transparent hover:border-primary'}`}
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
                onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
                  const lines = splitPastedList(e.clipboardData.getData('text/plain'));
                  if (lines.length < 2) return;
                  e.preventDefault();
                  onChange(insertLines(rows, index, lines, max, maxLength));
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
                className="flex size-7 shrink-0 items-center justify-center rounded-brand text-muted hover:bg-mist hover:text-primary disabled:opacity-30"
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
        className="inline-flex items-center gap-1 self-start rounded-brand px-1.5 py-1 font-semibold text-ink hover:bg-mist disabled:opacity-40"
      >
        <PlusIcon size={16} />
        {t(addKey)}
      </button>
    </div>
  );
}
