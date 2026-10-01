import { STORAGE_KEYS, newUuid } from '@pulse/shared';
import * as z from 'zod/mini';

const beatSchema = z.object({ nonce: z.string(), itemId: z.string(), startedAt: z.number(), t: z.number() });

/**
 * Duplicate-detection safety net (§6.5 fallback): edit-view instances write a heartbeat with their item id.
 * If another live instance with the same item id started earlier, this one is probably a copied slide.
 * Only edit view takes part: presenter view legitimately runs the same item twice.
 */
export class Heartbeat {
  readonly nonce = newUuid();
  readonly startedAt = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;

  start(getItemId: () => string | null, onDuplicate: (duplicate: boolean) => void): void {
    this.stop();
    const tick = (): void => {
      const itemId = getItemId();
      const now = Date.now();
      const key = `${STORAGE_KEYS.heartbeatPrefix}${this.nonce}`;
      try {
        if (itemId) window.localStorage.setItem(key, JSON.stringify({ nonce: this.nonce, itemId, startedAt: this.startedAt, t: now }));
        else window.localStorage.removeItem(key);
        let duplicate = false;
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (!k?.startsWith(STORAGE_KEYS.heartbeatPrefix) || k === key) continue;
          const parsed = beatSchema.safeParse(JSON.parse(window.localStorage.getItem(k) ?? 'null'));
          if (!parsed.success || now - parsed.data.t > 60_000) {
            window.localStorage.removeItem(k);
            continue;
          }
          const other = parsed.data;
          if (itemId && other.itemId === itemId && now - other.t < 5000 && other.startedAt < this.startedAt) duplicate = true;
        }
        onDuplicate(duplicate);
      } catch {
        onDuplicate(false);
      }
    };
    tick();
    this.timer = setInterval(tick, 2000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      window.localStorage.removeItem(`${STORAGE_KEYS.heartbeatPrefix}${this.nonce}`);
    } catch {
      // ignore
    }
  }
}
