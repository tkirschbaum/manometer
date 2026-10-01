import { STORAGE_KEYS } from '@pulse/shared';
import * as z from 'zod/mini';
import { deckLinkSchema } from './schemas';
import type { DeckLink } from '../office/types';

const registrySchema = z.array(
  z.object({
    ...deckLinkSchema.shape,
    lastUsedAt: z.number(),
  }),
);
export type RegistryEntry = z.output<typeof registrySchema>[number];

function read(): RegistryEntry[] {
  try {
    const parsed = registrySchema.safeParse(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.deckRegistry) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/**
 * Device-local deck registry (§6.4 fallback, always on): every instance that loads with a deck in edit
 * mode records it, so a freshly inserted instance can offer "Mit Live-Session … verbinden".
 */
export const deckRegistry = {
  list(): RegistryEntry[] {
    return read().sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  },
  remember(link: DeckLink): void {
    const entries = read().filter((e) => e.deckId !== link.deckId);
    entries.push({ ...link, lastUsedAt: Date.now() });
    entries.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    try {
      window.localStorage.setItem(STORAGE_KEYS.deckRegistry, JSON.stringify(entries.slice(0, 30)));
    } catch {
      // storage unavailable: linking falls back to a new session
    }
  },
};
