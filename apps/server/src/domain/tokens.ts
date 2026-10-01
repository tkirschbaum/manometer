import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Signed tokens for the dashboard and exports (§5.7). HMAC-SHA256 over a base64url JSON body.
 *  - entry:   single use, 5 minutes; created by the add-in (export:token) and opened in the browser.
 *  - session: issued in exchange for an entry token, valid 60 minutes, used by the dashboard for its
 *             API calls and export downloads (the browser has no deck secret).
 */
const bodySchema = z.object({
  d: z.uuid(),
  k: z.enum(['entry', 'session']),
  e: z.number().int(),
  j: z.string().min(8).max(64),
});
export type TokenBody = z.output<typeof bodySchema>;
export type TokenKind = TokenBody['k'];

export const TOKEN_TTL_MS: Record<TokenKind, number> = { entry: 5 * 60_000, session: 60 * 60_000 };

const b64 = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

export class TokenService {
  private readonly used = new Map<string, number>();

  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  sign(deckId: string, kind: TokenKind): string {
    const body: TokenBody = { d: deckId, k: kind, e: this.now() + TOKEN_TTL_MS[kind], j: randomUUID() };
    const payload = b64(JSON.stringify(body));
    return `${payload}.${this.mac(payload)}`;
  }

  /** Verifies signature, expiry and kind. Entry tokens are consumed (single use). */
  verify(token: string | undefined, kind: TokenKind): TokenBody | null {
    if (!token || token.length > 512) return null;
    const [payload, mac] = token.split('.');
    if (!payload || !mac) return null;
    const expected = Buffer.from(this.mac(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    let parsed: TokenBody;
    try {
      parsed = bodySchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    } catch {
      return null;
    }
    const now = this.now();
    if (parsed.k !== kind || parsed.e < now) return null;
    if (kind === 'entry') {
      this.sweep(now);
      if (this.used.has(parsed.j)) return null;
      this.used.set(parsed.j, parsed.e);
    }
    return parsed;
  }

  private mac(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  private sweep(now: number): void {
    for (const [jti, expiry] of this.used) if (expiry < now) this.used.delete(jti);
  }
}
