import { newShortId } from '@pulse/shared';

interface Row {
  id: string;
  label: string;
}

/** Splits pasted text into answers: one per line, list markers ("- ", "1.", "a)") removed. */
export function splitPastedList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d+[.)]|[a-zA-Z]\))\s+/, '').trim())
    .filter((line) => line !== '');
}

/** Puts pasted lines into the list: the current row if empty, then the following empty rows, then new rows. */
export function insertLines(rows: Row[], index: number, lines: string[], max: number, maxLength: number): Row[] {
  const next = rows.map((r) => ({ ...r }));
  const queue = lines.map((line) => line.slice(0, maxLength));
  for (let i = index; i < next.length && queue.length > 0; i++) {
    const row = next[i];
    if (row?.label.trim() === '') row.label = queue.shift() ?? '';
  }
  while (queue.length > 0 && next.length < max) next.push({ id: newShortId(), label: queue.shift() ?? '' });
  return next;
}
