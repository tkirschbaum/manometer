import { createHash, timingSafeEqual } from 'node:crypto';

/** sha256 hex of the 256-bit deck secret (§5.1); a plain hash is adequate for a random secret of that size. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests (§9). */
export function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** First 8 hex chars of sha256(salt + participant id): stable per deployment, not reversible to the raw id (§5.7). */
export function participantRef(participantId: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${participantId}`, 'utf8').digest('hex').slice(0, 8);
}

/** sha256 of canonical JSON (sorted keys) for slide_items.config_hash. */
export function configHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
