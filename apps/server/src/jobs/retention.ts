import { localClock } from '../domain/time';
import type { HubLogger } from '../realtime/hub';
import type { Store } from '../realtime/store';

/** Deletes decks inactive for longer than `retentionDays` (§5.8). Returns the deleted deck ids. */
export async function runRetention(store: Store, now: Date, retentionDays: number): Promise<string[]> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return store.deleteDecksInactiveSince(cutoff);
}

const RUN_AT_MINUTES = 3 * 60 + 30; // 03:30 local time

/**
 * In-process daily job: checks every minute and runs once per local day after 03:30 (Europe/Vienna).
 * `clock` is injectable for tests.
 */
export function scheduleRetention(opts: {
  store: Store;
  retentionDays: number;
  timeZone: string;
  logger: HubLogger;
  onDeleted: (deckIds: string[]) => void;
  clock?: () => Date;
  intervalMs?: number;
}): { stop: () => void; tick: () => Promise<void> } {
  const clock = opts.clock ?? (() => new Date());
  let lastRunDay: string | null = null;
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    const now = clock();
    const { day, minutes } = localClock(now, opts.timeZone);
    if (minutes < RUN_AT_MINUTES || lastRunDay === day) return;
    running = true;
    try {
      const deleted = await runRetention(opts.store, now, opts.retentionDays);
      lastRunDay = day;
      opts.onDeleted(deleted);
      opts.logger.info({ deleted: deleted.length, retentionDays: opts.retentionDays }, 'retention run');
    } catch (error) {
      opts.logger.error({ err: error }, 'retention run failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), opts.intervalMs ?? 60_000);
  timer.unref();
  return { stop: () => clearInterval(timer), tick };
}
