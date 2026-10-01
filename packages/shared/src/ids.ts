/** UUID v4 from Web Crypto (browsers and Node 22). */
export function newUuid(): string {
  return globalThis.crypto.randomUUID();
}

/** Short id for options and statements (8 chars, URL-safe). */
export function newShortId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(36).padStart(2, '0').slice(-2);
  return out.slice(0, 8);
}

/** 32 random bytes as base64url without padding: the deck secret (§9). */
export function newDeckSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
