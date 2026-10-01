import { randomInt } from 'node:crypto';

/**
 * Join codes (§5.2): 6 random digits; reject codes where one digit appears 4 or more times
 * and simple ascending/descending runs (123456, 987654).
 */
export function isAcceptableJoinCode(code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counts = new Map<string, number>();
  for (const digit of Array.from(code)) counts.set(digit, (counts.get(digit) ?? 0) + 1);
  if ([...counts.values()].some((n) => n >= 4)) return false;
  const digits = Array.from(code, Number);
  const steps = digits.slice(1).map((d, i) => d - (digits[i] ?? 0));
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return false;
  return true;
}

export function randomJoinCode(random: (max: number) => number = (max) => randomInt(max)): string {
  for (;;) {
    const code = String(random(1_000_000)).padStart(6, '0');
    if (isAcceptableJoinCode(code)) return code;
  }
}

/**
 * Generates a code and retries while `tryInsert` reports a collision (returns false).
 * `tryInsert` must use the unique constraint, not a prior lookup, so concurrent creators cannot collide.
 */
export async function allocateJoinCode(
  tryInsert: (code: string) => Promise<boolean>,
  generate: () => string = () => randomJoinCode(),
  maxAttempts = 50,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generate();
    if (await tryInsert(code)) return code;
  }
  throw new Error('Could not allocate a free join code');
}
