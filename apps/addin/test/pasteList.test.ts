import { describe, expect, it } from 'vitest';
import { insertLines, splitPastedList } from '../src/model/pasteList';

describe('pasting a list into the answers', () => {
  it('splits lines and removes list markers', () => {
    expect(splitPastedList('- Leber\n• Niere\r\n\n1. Milz\n2) Herz\na) Lunge\n  Magen  ')).toEqual([
      'Leber',
      'Niere',
      'Milz',
      'Herz',
      'Lunge',
      'Magen',
    ]);
    // A hyphen inside a word is not a list marker.
    expect(splitPastedList('pH-Wert')).toEqual(['pH-Wert']);
    // "z. B." is text, not a list marker.
    expect(splitPastedList('z. B. Leber\nNiere')).toEqual(['z. B. Leber', 'Niere']);
  });

  it('fills the current row, then empty rows, then new rows up to the maximum', () => {
    const rows = [
      { id: 'a', label: 'Rot' },
      { id: 'b', label: '' },
      { id: 'c', label: 'Grün' },
      { id: 'd', label: '' },
    ];
    const next = insertLines(rows, 1, ['Blau', 'Gelb', 'Lila', 'Weiß', 'Schwarz'], 6, 120);
    expect(next.map((r) => r.label)).toEqual(['Rot', 'Blau', 'Grün', 'Gelb', 'Lila', 'Weiß']);
    expect(next.slice(0, 4).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows[1]?.label).toBe('');
  });

  it('cuts lines to the maximum length', () => {
    expect(insertLines([{ id: 'a', label: '' }], 0, ['abcdef'], 2, 3)[0]?.label).toBe('abc');
  });
});
