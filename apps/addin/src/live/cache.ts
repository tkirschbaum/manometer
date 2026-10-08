import {
  itemStateSchema,
  leaderboardViewSchema,
  qaListSchema,
  resultsViewSchema,
  type LeaderboardView,
  type QaItemView,
  type ResultsView,
} from '@pulse/shared';
import * as z from 'zod/mini';
import type { ItemLiveState } from './live';

/**
 * Last known live data per item and per deck in localStorage, so a slide that appears in the slideshow shows
 * its results immediately instead of an empty state until the server answers (no "slide in between").
 * Entries expire after 12 hours and are only ever read on the presenter's own computer.
 */
const PREFIX = 'pulse.cache.';
const TTL_MS = 12 * 60 * 60 * 1000;

const itemLiveSchema = z.object({
  state: itemStateSchema,
  revealed: z.boolean(),
  phaseEndsAt: z.nullable(z.number()),
});
const itemEntrySchema = z.object({
  savedAt: z.number(),
  item: z.nullable(itemLiveSchema),
  results: z.nullable(resultsViewSchema),
});
const deckEntrySchema = z.object({
  savedAt: z.number(),
  participants: z.number(),
  leaderboard: z.nullable(leaderboardViewSchema),
  qa: qaListSchema.shape.items,
});

export interface CachedItem {
  item: ItemLiveState | null;
  results: ResultsView | null;
}
export interface CachedDeck {
  participants: number;
  leaderboard: LeaderboardView | null;
  qa: QaItemView[];
}

function read<T>(key: string, schema: z.ZodMiniType<T>): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: the slide simply starts without cached data
  }
}

const fresh = (savedAt: number): boolean => Date.now() - savedAt < TTL_MS;

/** Timed quiz phases are never restored: their deadline is stale by the time the slide appears again. */
function restorable(item: ItemLiveState | null): ItemLiveState | null {
  return item && item.state !== 'countdown' && item.state !== 'answering' ? item : null;
}

export const liveCache = {
  readItem(itemId: string): CachedItem | null {
    const entry = read(`item.${itemId}`, itemEntrySchema);
    return entry && fresh(entry.savedAt) ? { item: restorable(entry.item), results: entry.results } : null;
  },
  writeItem(itemId: string, data: CachedItem): void {
    write(`item.${itemId}`, { savedAt: Date.now(), item: restorable(data.item), results: data.results });
  },
  readDeck(deckId: string): CachedDeck | null {
    const entry = read(`deck.${deckId}`, deckEntrySchema);
    return entry && fresh(entry.savedAt) ? entry : null;
  },
  writeDeck(deckId: string, data: CachedDeck): void {
    write(`deck.${deckId}`, { savedAt: Date.now(), ...data });
  },
  /** Removes expired entries (called once per add-in start). */
  purge(): void {
    try {
      const storage = window.localStorage;
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        const savedAt = (JSON.parse(storage.getItem(key) ?? '{}') as { savedAt?: unknown }).savedAt;
        if (typeof savedAt !== 'number' || !fresh(savedAt)) storage.removeItem(key);
      }
    } catch {
      // ignore
    }
  },
};
