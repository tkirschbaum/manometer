import { LIMITS } from '@pulse/shared';

export interface NormalisedWord {
  /** Display form as typed (after cleanup). */
  text: string;
  /** Grouping key: case-folded only, no German folding ("Straße" ≠ "Strasse"). */
  key: string;
}

const EDGE_PUNCTUATION = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;

/** §5.5: trim, collapse whitespace, NFC, strip leading/trailing punctuation; null if empty or too long. */
export function normaliseWord(input: string): NormalisedWord | null {
  const text = input.normalize('NFC').replace(/\s+/g, ' ').trim().replace(EDGE_PUNCTUATION, '');
  if (text.length === 0 || Array.from(text).length > LIMITS.wordMax) return null;
  return { text, key: text.toLocaleLowerCase('de') };
}

/** Most frequent original casing in a group; ties go to the earliest seen. */
export function displayForm(casings: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [text, count] of casings) {
    if (count > bestCount) {
      best = text;
      bestCount = count;
    }
  }
  return best;
}
