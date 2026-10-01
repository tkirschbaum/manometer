import { deckSecretSchema, deckSettingsSchema, joinCodeSchema, uuidSchema } from '@pulse/shared';
import * as z from 'zod/mini';

export const deckLinkSchema = z.object({
  deckId: uuidSchema,
  secret: deckSecretSchema,
  joinCode: z._default(z.string(), ''),
  title: z._default(z.string(), ''),
});

const optionDraft = z.object({ id: z.string(), label: z.string() });

/**
 * The editor's working copy of a slide item. Flat on purpose: switching the type keeps the other fields,
 * and half-finished questions (empty prompt, empty options) are kept in the file. Only a draft that
 * passes the shared SlideItemConfig schema is sent to the server (see draft.ts toConfig).
 */
export const itemDraftSchema = z.object({
  id: uuidSchema,
  kind: z.enum(['question', 'leaderboard', 'qa_wall']),
  type: z.enum(['multiple_choice', 'word_cloud', 'open_text', 'scale', 'quiz']),
  prompt: z.string(),
  resultsVisibility: z.enum(['live', 'on_reveal']),
  showOnPhone: z.boolean(),
  options: z.array(optionDraft),
  allowMultiple: z.boolean(),
  maxSelections: z.nullable(z.number()),
  correctOptionIds: z.array(z.string()),
  wordEntries: z.number(),
  textEntries: z.number(),
  statements: z.array(optionDraft),
  range: z.literal([5, 10]),
  minLabel: z.string(),
  maxLabel: z.string(),
  quizCorrectOptionId: z.nullable(z.string()),
  timeLimitSec: z.literal([10, 15, 20, 30, 45, 60]),
  startMode: z.enum(['auto', 'click']),
});
export type ItemDraft = z.output<typeof itemDraftSchema>;

/** The single "pulse" settings key of one add-in instance (§6.3). */
export const addinSettingsSchema = z.object({
  v: z.literal(1),
  deck: z.nullable(
    z.object({
      id: uuidSchema,
      secret: deckSecretSchema,
      joinCode: z.union([joinCodeSchema, z.literal('')]),
      settings: deckSettingsSchema,
      /** Public base URL for the join strip and QR code, so the slide renders offline (principle 4). */
      baseUrl: z._default(z.string(), ''),
    }),
  ),
  item: z.nullable(itemDraftSchema),
  boundSlideId: z.nullable(z.string()),
  lastSyncedHash: z.nullable(z.string()),
});
export type AddinSettings = z.output<typeof addinSettingsSchema>;
export type DeckRef = NonNullable<AddinSettings['deck']>;

export const emptySettings: AddinSettings = { v: 1, deck: null, item: null, boundSlideId: null, lastSyncedHash: null };

export function parseSettings(raw: unknown): AddinSettings {
  const parsed = addinSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptySettings;
}
