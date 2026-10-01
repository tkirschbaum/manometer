import { z } from 'zod';
import { LIMITS, QUIZ_TIME_LIMITS } from './constants';

// ---------------------------------------------------------------------------
// Primitives

export const uuidSchema = z.uuid();
export const shortIdSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/);
export const joinCodeSchema = z.string().regex(/^\d{6}$/);
/** 32 random bytes, base64url without padding (§9). */
export const deckSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const languageSchema = z.enum(['de', 'en']);
export type Language = z.output<typeof languageSchema>;

export const themeSchema = z.enum(['light', 'dark']);
export type Theme = z.output<typeof themeSchema>;

// ---------------------------------------------------------------------------
// Deck

export const deckSettingsSchema = z.object({
  title: z.string().trim().max(LIMITS.titleMax).default(''),
  slideLanguage: languageSchema.default('de'),
  theme: themeSchema.default('light'),
  qaEnabled: z.boolean().default(false),
  showQr: z.boolean().default(true),
});
export type DeckSettings = z.output<typeof deckSettingsSchema>;

export const defaultDeckSettings: DeckSettings = {
  title: '',
  slideLanguage: 'de',
  theme: 'light',
  qaEnabled: false,
  showQr: true,
};

// ---------------------------------------------------------------------------
// Slide items (§4.3)

export const questionTypeSchema = z.enum(['multiple_choice', 'word_cloud', 'open_text', 'scale', 'quiz']);
export type QuestionType = z.output<typeof questionTypeSchema>;

export const itemKindSchema = z.enum(['question', 'leaderboard', 'qa_wall']);
export type ItemKind = z.output<typeof itemKindSchema>;

export const optionSchema = z.object({
  id: shortIdSchema,
  label: z.string().trim().min(1).max(LIMITS.optionLabelMax),
});
export type Option = z.output<typeof optionSchema>;

export const statementSchema = z.object({
  id: shortIdSchema,
  label: z.string().trim().min(1).max(LIMITS.statementLabelMax),
});
export type Statement = z.output<typeof statementSchema>;

const itemBase = {
  id: uuidSchema,
  deckId: uuidSchema,
  schemaVersion: z.literal(1),
};

const questionBase = {
  ...itemBase,
  kind: z.literal('question'),
  prompt: z.string().trim().min(1).max(LIMITS.promptMax),
  resultsVisibility: z.enum(['live', 'on_reveal']).default('live'),
  showOnPhone: z.boolean().default(false),
};

function uniqueIds(list: { id: string }[]): boolean {
  return new Set(list.map((entry) => entry.id)).size === list.length;
}

export const multipleChoiceConfigSchema = z
  .object({
    ...questionBase,
    type: z.literal('multiple_choice'),
    options: z.array(optionSchema).min(LIMITS.mcOptionsMin).max(LIMITS.mcOptionsMax),
    allowMultiple: z.boolean().default(false),
    maxSelections: z.number().int().min(2).max(LIMITS.mcOptionsMax).optional(),
    correctOptionIds: z.array(shortIdSchema).max(LIMITS.mcOptionsMax).optional(),
  })
  .superRefine((value, ctx) => {
    if (!uniqueIds(value.options)) ctx.addIssue({ code: 'custom', message: 'Duplicate option id', path: ['options'] });
    if (value.maxSelections !== undefined && value.maxSelections > value.options.length) {
      ctx.addIssue({ code: 'custom', message: 'maxSelections exceeds options', path: ['maxSelections'] });
    }
    const ids = new Set(value.options.map((o) => o.id));
    if (value.correctOptionIds?.some((id) => !ids.has(id))) {
      ctx.addIssue({ code: 'custom', message: 'Unknown correct option', path: ['correctOptionIds'] });
    }
  });

export const wordCloudConfigSchema = z.object({
  ...questionBase,
  type: z.literal('word_cloud'),
  entriesPerParticipant: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
});

export const openTextConfigSchema = z.object({
  ...questionBase,
  type: z.literal('open_text'),
  entriesPerParticipant: z.number().int().min(1).max(LIMITS.openTextEntriesMax).default(1),
});

export const scaleConfigSchema = z
  .object({
    ...questionBase,
    type: z.literal('scale'),
    statements: z.array(statementSchema).min(LIMITS.statementsMin).max(LIMITS.statementsMax),
    range: z.union([z.literal(5), z.literal(10)]).default(5),
    minLabel: z.string().trim().max(LIMITS.scaleLabelMax).optional(),
    maxLabel: z.string().trim().max(LIMITS.scaleLabelMax).optional(),
  })
  .superRefine((value, ctx) => {
    if (!uniqueIds(value.statements)) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate statement id', path: ['statements'] });
    }
  });

const quizTimeLimitSchema = z.union(QUIZ_TIME_LIMITS.map((n) => z.literal(n)) as [
  z.ZodLiteral<10>,
  z.ZodLiteral<15>,
  z.ZodLiteral<20>,
  z.ZodLiteral<30>,
  z.ZodLiteral<45>,
  z.ZodLiteral<60>,
]);

export const quizConfigSchema = z
  .object({
    ...questionBase,
    type: z.literal('quiz'),
    options: z.array(optionSchema).min(LIMITS.quizOptionsMin).max(LIMITS.quizOptionsMax),
    correctOptionId: shortIdSchema,
    timeLimitSec: quizTimeLimitSchema.default(20),
    startMode: z.enum(['auto', 'click']).default('auto'),
  })
  .superRefine((value, ctx) => {
    if (!uniqueIds(value.options)) ctx.addIssue({ code: 'custom', message: 'Duplicate option id', path: ['options'] });
    if (!value.options.some((o) => o.id === value.correctOptionId)) {
      ctx.addIssue({ code: 'custom', message: 'Correct option missing', path: ['correctOptionId'] });
    }
  });

export const questionConfigSchema = z.discriminatedUnion('type', [
  multipleChoiceConfigSchema,
  wordCloudConfigSchema,
  openTextConfigSchema,
  scaleConfigSchema,
  quizConfigSchema,
]);

export const leaderboardConfigSchema = z.object({ ...itemBase, kind: z.literal('leaderboard') });
export const qaWallConfigSchema = z.object({ ...itemBase, kind: z.literal('qa_wall') });

export const slideItemConfigSchema = z.discriminatedUnion('kind', [
  questionConfigSchema,
  leaderboardConfigSchema,
  qaWallConfigSchema,
]);

export type MultipleChoiceConfig = z.output<typeof multipleChoiceConfigSchema>;
export type WordCloudConfig = z.output<typeof wordCloudConfigSchema>;
export type OpenTextConfig = z.output<typeof openTextConfigSchema>;
export type ScaleConfig = z.output<typeof scaleConfigSchema>;
export type QuizConfig = z.output<typeof quizConfigSchema>;
export type QuestionConfig = z.output<typeof questionConfigSchema>;
export type LeaderboardConfig = z.output<typeof leaderboardConfigSchema>;
export type QaWallConfig = z.output<typeof qaWallConfigSchema>;
export type SlideItemConfig = z.output<typeof slideItemConfigSchema>;

// ---------------------------------------------------------------------------
// Item state

export const itemStateSchema = z.enum(['idle', 'open', 'closed', 'countdown', 'answering', 'reveal']);
export type ItemState = z.output<typeof itemStateSchema>;

/** What participants are allowed to see of the active item. Never contains the correct answer before reveal. */
export const publicItemViewSchema = z.object({
  id: uuidSchema,
  kind: itemKindSchema,
  type: questionTypeSchema.nullable(),
  prompt: z.string(),
  state: itemStateSchema,
  revealed: z.boolean(),
  phaseEndsAt: z.number().nullable(),
  options: z.array(optionSchema),
  allowMultiple: z.boolean(),
  maxSelections: z.number().int().nullable(),
  entriesPerParticipant: z.number().int(),
  statements: z.array(statementSchema),
  range: z.number().int(),
  minLabel: z.string().nullable(),
  maxLabel: z.string().nullable(),
  timeLimitSec: z.number().int().nullable(),
  correctOptionIds: z.array(shortIdSchema).nullable(),
  showOnPhone: z.boolean(),
});
export type PublicItemView = z.output<typeof publicItemViewSchema>;

// ---------------------------------------------------------------------------
// Responses

export const multipleChoicePayloadSchema = z.object({
  type: z.literal('multiple_choice'),
  optionIds: z.array(shortIdSchema).min(1).max(LIMITS.mcOptionsMax),
});
export const wordCloudPayloadSchema = z.object({
  type: z.literal('word_cloud'),
  text: z.string().max(LIMITS.wordInputMax),
});
export const openTextPayloadSchema = z.object({
  type: z.literal('open_text'),
  text: z.string().trim().min(1).max(LIMITS.textMax),
});
export const scalePayloadSchema = z.object({
  type: z.literal('scale'),
  ratings: z.record(shortIdSchema, z.number().int().min(1).max(10)),
});
export const quizPayloadSchema = z.object({
  type: z.literal('quiz'),
  optionId: shortIdSchema,
});
export const responsePayloadSchema = z.discriminatedUnion('type', [
  multipleChoicePayloadSchema,
  wordCloudPayloadSchema,
  openTextPayloadSchema,
  scalePayloadSchema,
  quizPayloadSchema,
]);
export type ResponsePayload = z.output<typeof responsePayloadSchema>;

export const quizResultSchema = z.object({
  itemId: uuidSchema,
  /** null: the participant did not answer. */
  correct: z.boolean().nullable(),
  points: z.number().int(),
  totalPoints: z.number().int(),
  rank: z.number().int().nullable(),
  rankOf: z.number().int(),
});
export type QuizResult = z.output<typeof quizResultSchema>;

export const myResponseStateSchema = z.object({
  itemId: uuidSchema,
  submissions: z.array(responsePayloadSchema),
  quizResult: quizResultSchema.nullable(),
});
export type MyResponseState = z.output<typeof myResponseStateSchema>;

// ---------------------------------------------------------------------------
// Results (server -> presenter, and participants when showOnPhone)

const resultsBase = {
  itemId: uuidSchema,
  /** Distinct participants who answered. */
  respondents: z.number().int(),
  /** Visible responses (word cloud / open text can have several per participant). */
  responses: z.number().int(),
};

export const resultsViewSchema = z.discriminatedUnion('type', [
  z.object({ ...resultsBase, type: z.literal('multiple_choice'), counts: z.record(z.string(), z.number().int()) }),
  z.object({
    ...resultsBase,
    type: z.literal('word_cloud'),
    words: z.array(z.object({ key: z.string(), text: z.string(), count: z.number().int() })),
  }),
  z.object({
    ...resultsBase,
    type: z.literal('open_text'),
    entries: z.array(z.object({ id: z.string(), text: z.string(), at: z.number() })),
  }),
  z.object({
    ...resultsBase,
    type: z.literal('scale'),
    statements: z.array(
      z.object({
        id: z.string(),
        n: z.number().int(),
        average: z.number().nullable(),
        histogram: z.array(z.number().int()),
      }),
    ),
  }),
  z.object({ ...resultsBase, type: z.literal('quiz'), counts: z.record(z.string(), z.number().int()) }),
]);
export type ResultsView = z.output<typeof resultsViewSchema>;

export const leaderboardEntrySchema = z.object({
  rank: z.number().int(),
  nickname: z.string(),
  points: z.number().int(),
});
export const leaderboardViewSchema = z.object({
  entries: z.array(leaderboardEntrySchema),
  players: z.number().int(),
  quizCount: z.number().int(),
});
export type LeaderboardView = z.output<typeof leaderboardViewSchema>;

// ---------------------------------------------------------------------------
// Q&A

export const qaItemViewSchema = z.object({
  id: uuidSchema,
  text: z.string(),
  upvotes: z.number().int(),
  answered: z.boolean(),
  createdAt: z.number(),
});
export type QaItemView = z.output<typeof qaItemViewSchema>;

export const qaListSchema = z.object({ items: z.array(qaItemViewSchema) });
export type QaList = z.output<typeof qaListSchema>;

// ---------------------------------------------------------------------------
// Deck state messages

export const presenterDeckStateSchema = z.object({
  deckId: uuidSchema,
  joinCode: joinCodeSchema,
  /** True when this connection created the deck (new deck, or recreated after retention). */
  created: z.boolean(),
  settings: deckSettingsSchema,
  activeItemId: uuidSchema.nullable(),
  publicBaseUrl: z.string(),
  retentionDays: z.number().int(),
  serverNow: z.number(),
});
export type PresenterDeckState = z.output<typeof presenterDeckStateSchema>;

export const itemStateMessageSchema = z.object({
  itemId: uuidSchema,
  state: itemStateSchema,
  revealed: z.boolean(),
  phaseEndsAt: z.number().nullable(),
  serverNow: z.number(),
});
export type ItemStateMessage = z.output<typeof itemStateMessageSchema>;

export const participantDeckStateSchema = z.object({
  deck: z.object({ title: z.string(), slideLanguage: languageSchema, qaEnabled: z.boolean() }),
  activeItem: publicItemViewSchema.nullable(),
  serverNow: z.number(),
});
export type ParticipantDeckState = z.output<typeof participantDeckStateSchema>;

// ---------------------------------------------------------------------------
// Errors and acks

export const errorCodeSchema = z.enum([
  'INVALID_PAYLOAD',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'NOT_ACTIVE',
  'CLOSED',
  'TOO_LATE',
  'ALREADY_ANSWERED',
  'LIMIT_REACHED',
  'RATE_LIMITED',
  'NICKNAME_REQUIRED',
  'EMPTY_AFTER_NORMALISATION',
  'DECK_NOT_FOUND',
  'INTERNAL',
]);
export type ErrorCode = z.output<typeof errorCodeSchema>;

export type AckOk<T> = { ok: true } & T;
export type AckError = { ok: false; error: ErrorCode };
export type Ack<T = object> = AckOk<T> | AckError;
