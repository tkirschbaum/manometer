// zod/mini: same validation as classic zod at a fraction of the bundle size (participant budget, §7.3).
import * as z from 'zod/mini';
import { LIMITS, QUIZ_TIME_LIMITS } from './constants';

const text = (min: number, max: number) => z.string().check(z.trim(), z.minLength(min), z.maxLength(max));
const optionalText = (max: number) => z.optional(z.string().check(z.trim(), z.maxLength(max)));
const intIn = (min: number, max: number) => z.int().check(z.gte(min), z.lte(max));

// ---------------------------------------------------------------------------
// Primitives

export const uuidSchema = z.uuid();
export const shortIdSchema = z.string().check(z.minLength(1), z.maxLength(40), z.regex(/^[A-Za-z0-9_-]+$/));
export const joinCodeSchema = z.string().check(z.regex(/^\d{6}$/));
/** 32 random bytes, base64url without padding (§9). */
export const deckSecretSchema = z.string().check(z.regex(/^[A-Za-z0-9_-]{43}$/));

export const languageSchema = z.enum(['de', 'en']);
export type Language = z.output<typeof languageSchema>;

export const themeSchema = z.enum(['light', 'dark']);
export type Theme = z.output<typeof themeSchema>;

// ---------------------------------------------------------------------------
// Deck

export const deckSettingsSchema = z.object({
  title: z._default(z.string().check(z.trim(), z.maxLength(LIMITS.titleMax)), ''),
  slideLanguage: z._default(languageSchema, 'de'),
  theme: z._default(themeSchema, 'light'),
  qaEnabled: z._default(z.boolean(), false),
  showQr: z._default(z.boolean(), true),
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
  label: text(1, LIMITS.optionLabelMax),
});
export type Option = z.output<typeof optionSchema>;

export const statementSchema = z.object({
  id: shortIdSchema,
  label: text(1, LIMITS.statementLabelMax),
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
  prompt: text(1, LIMITS.promptMax),
  resultsVisibility: z._default(z.enum(['live', 'on_reveal']), 'live'),
  showOnPhone: z._default(z.boolean(), false),
};

function uniqueIds(list: { id: string }[]): boolean {
  return new Set(list.map((entry) => entry.id)).size === list.length;
}

export const multipleChoiceConfigSchema = z
  .object({
    ...questionBase,
    type: z.literal('multiple_choice'),
    options: z.array(optionSchema).check(z.minLength(LIMITS.mcOptionsMin), z.maxLength(LIMITS.mcOptionsMax)),
    allowMultiple: z._default(z.boolean(), false),
    maxSelections: z.optional(intIn(2, LIMITS.mcOptionsMax)),
    correctOptionIds: z.optional(z.array(shortIdSchema).check(z.maxLength(LIMITS.mcOptionsMax))),
  })
  .check(
    z.superRefine((value, ctx) => {
      if (!uniqueIds(value.options))
        ctx.addIssue({ code: 'custom', message: 'Duplicate option id', path: ['options'] });
      if (value.maxSelections !== undefined && value.maxSelections > value.options.length) {
        ctx.addIssue({ code: 'custom', message: 'maxSelections exceeds options', path: ['maxSelections'] });
      }
      const ids = new Set(value.options.map((o) => o.id));
      if (value.correctOptionIds?.some((id) => !ids.has(id))) {
        ctx.addIssue({ code: 'custom', message: 'Unknown correct option', path: ['correctOptionIds'] });
      }
    }),
  );

export const wordCloudConfigSchema = z.object({
  ...questionBase,
  type: z.literal('word_cloud'),
  entriesPerParticipant: z._default(z.literal([1, 2, 3]), 3),
});

export const openTextConfigSchema = z.object({
  ...questionBase,
  type: z.literal('open_text'),
  entriesPerParticipant: z._default(intIn(1, LIMITS.openTextEntriesMax), 1),
});

export const scaleConfigSchema = z
  .object({
    ...questionBase,
    type: z.literal('scale'),
    statements: z.array(statementSchema).check(z.minLength(LIMITS.statementsMin), z.maxLength(LIMITS.statementsMax)),
    range: z._default(z.literal([5, 10]), 5),
    minLabel: optionalText(LIMITS.scaleLabelMax),
    maxLabel: optionalText(LIMITS.scaleLabelMax),
  })
  .check(
    z.superRefine((value, ctx) => {
      if (!uniqueIds(value.statements)) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate statement id', path: ['statements'] });
      }
    }),
  );

export const quizConfigSchema = z
  .object({
    ...questionBase,
    type: z.literal('quiz'),
    options: z.array(optionSchema).check(z.minLength(LIMITS.quizOptionsMin), z.maxLength(LIMITS.quizOptionsMax)),
    correctOptionId: shortIdSchema,
    timeLimitSec: z._default(z.literal(QUIZ_TIME_LIMITS), 20),
    startMode: z._default(z.enum(['auto', 'click']), 'auto'),
  })
  .check(
    z.superRefine((value, ctx) => {
      if (!uniqueIds(value.options))
        ctx.addIssue({ code: 'custom', message: 'Duplicate option id', path: ['options'] });
      if (!value.options.some((o) => o.id === value.correctOptionId)) {
        ctx.addIssue({ code: 'custom', message: 'Correct option missing', path: ['correctOptionId'] });
      }
    }),
  );

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
  type: z.nullable(questionTypeSchema),
  prompt: z.string(),
  state: itemStateSchema,
  revealed: z.boolean(),
  phaseEndsAt: z.nullable(z.number()),
  options: z.array(optionSchema),
  allowMultiple: z.boolean(),
  maxSelections: z.nullable(z.int()),
  entriesPerParticipant: z.int(),
  statements: z.array(statementSchema),
  range: z.int(),
  minLabel: z.nullable(z.string()),
  maxLabel: z.nullable(z.string()),
  timeLimitSec: z.nullable(z.int()),
  correctOptionIds: z.nullable(z.array(shortIdSchema)),
  showOnPhone: z.boolean(),
});
export type PublicItemView = z.output<typeof publicItemViewSchema>;

// ---------------------------------------------------------------------------
// Responses

export const multipleChoicePayloadSchema = z.object({
  type: z.literal('multiple_choice'),
  optionIds: z.array(shortIdSchema).check(z.minLength(1), z.maxLength(LIMITS.mcOptionsMax)),
});
export const wordCloudPayloadSchema = z.object({
  type: z.literal('word_cloud'),
  text: z.string().check(z.maxLength(LIMITS.wordInputMax)),
});
export const openTextPayloadSchema = z.object({
  type: z.literal('open_text'),
  text: text(1, LIMITS.textMax),
});
export const scalePayloadSchema = z.object({
  type: z.literal('scale'),
  ratings: z.record(shortIdSchema, intIn(1, 10)),
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
  correct: z.nullable(z.boolean()),
  points: z.int(),
  totalPoints: z.int(),
  rank: z.nullable(z.int()),
  rankOf: z.int(),
});
export type QuizResult = z.output<typeof quizResultSchema>;

export const myResponseStateSchema = z.object({
  itemId: uuidSchema,
  submissions: z.array(responsePayloadSchema),
  quizResult: z.nullable(quizResultSchema),
});
export type MyResponseState = z.output<typeof myResponseStateSchema>;

// ---------------------------------------------------------------------------
// Results (server -> presenter, and participants when showOnPhone)

const resultsBase = {
  itemId: uuidSchema,
  /** Distinct participants who answered. */
  respondents: z.int(),
  /** Visible responses (word cloud / open text can have several per participant). */
  responses: z.int(),
};

export const resultsViewSchema = z.discriminatedUnion('type', [
  z.object({ ...resultsBase, type: z.literal('multiple_choice'), counts: z.record(z.string(), z.int()) }),
  z.object({
    ...resultsBase,
    type: z.literal('word_cloud'),
    words: z.array(z.object({ key: z.string(), text: z.string(), count: z.int() })),
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
        n: z.int(),
        average: z.nullable(z.number()),
        histogram: z.array(z.int()),
      }),
    ),
  }),
  z.object({ ...resultsBase, type: z.literal('quiz'), counts: z.record(z.string(), z.int()) }),
]);
export type ResultsView = z.output<typeof resultsViewSchema>;

export const leaderboardEntrySchema = z.object({
  rank: z.int(),
  nickname: z.string(),
  points: z.int(),
});
export const leaderboardViewSchema = z.object({
  entries: z.array(leaderboardEntrySchema),
  players: z.int(),
  quizCount: z.int(),
});
export type LeaderboardView = z.output<typeof leaderboardViewSchema>;

// ---------------------------------------------------------------------------
// Q&A

export const qaItemViewSchema = z.object({
  id: uuidSchema,
  text: z.string(),
  upvotes: z.int(),
  answered: z.boolean(),
  createdAt: z.number(),
});
export type QaItemView = z.output<typeof qaItemViewSchema>;

export const qaListSchema = z.object({ items: z.array(qaItemViewSchema) });
export type QaList = z.output<typeof qaListSchema>;

export const qaMineSchema = z.object({ mine: z.array(uuidSchema), voted: z.array(uuidSchema) });
export type QaMine = z.output<typeof qaMineSchema>;

export const meSchema = z.object({ nickname: z.nullable(z.string()) });
export type Me = z.output<typeof meSchema>;

// ---------------------------------------------------------------------------
// Deck state messages

export const presenterDeckStateSchema = z.object({
  deckId: uuidSchema,
  joinCode: joinCodeSchema,
  /** True when this connection created the deck (new deck, or recreated after retention). */
  created: z.boolean(),
  settings: deckSettingsSchema,
  activeItemId: z.nullable(uuidSchema),
  publicBaseUrl: z.string(),
  retentionDays: z.int(),
  serverNow: z.number(),
});
export type PresenterDeckState = z.output<typeof presenterDeckStateSchema>;

export const itemStateMessageSchema = z.object({
  itemId: uuidSchema,
  state: itemStateSchema,
  revealed: z.boolean(),
  phaseEndsAt: z.nullable(z.number()),
  serverNow: z.number(),
});
export type ItemStateMessage = z.output<typeof itemStateMessageSchema>;

export const participantDeckStateSchema = z.object({
  deck: z.object({ title: z.string(), slideLanguage: languageSchema, qaEnabled: z.boolean() }),
  activeItem: z.nullable(publicItemViewSchema),
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
