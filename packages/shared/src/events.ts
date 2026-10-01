import * as z from 'zod/mini';
import { LIMITS } from './constants';
import {
  deckSecretSchema,
  deckSettingsSchema,
  joinCodeSchema,
  responsePayloadSchema,
  shortIdSchema,
  slideItemConfigSchema,
  uuidSchema,
  type Ack,
  type ItemState,
  type ItemStateMessage,
  type Me,
  type QaMine,
  type LeaderboardView,
  type MyResponseState,
  type ParticipantDeckState,
  type PresenterDeckState,
  type QaList,
  type QuizResult,
  type ResultsView,
} from './schemas';

// ---------------------------------------------------------------------------
// Handshakes

export const presenterAuthSchema = z.object({ deckId: uuidSchema, deckSecret: deckSecretSchema });
export type PresenterAuth = z.output<typeof presenterAuthSchema>;

export const participantAuthSchema = z.object({ joinCode: joinCodeSchema, participantId: uuidSchema });
export type ParticipantAuth = z.output<typeof participantAuthSchema>;

// ---------------------------------------------------------------------------
// Presenter -> server payloads

export const deckUpsertSchema = z.object({ settings: deckSettingsSchema });
export const itemRefSchema = z.object({ itemId: uuidSchema });
export const itemActivateSchema = z.object({ itemId: uuidSchema, config: slideItemConfigSchema });
export const responseHideSchema = z.union([
  z.object({ itemId: uuidSchema, responseId: z.string().check(z.regex(/^\d{1,18}$/)) }),
  z.object({ itemId: uuidSchema, wordKey: z.string().check(z.minLength(1), z.maxLength(LIMITS.wordMax)) }),
]);
export const qaRefSchema = z.object({ qaItemId: uuidSchema });
export const qaAnsweredSchema = z.object({ qaItemId: uuidSchema, answered: z.boolean() });
export const emptySchema = z.strictObject({});

export interface ItemSnapshot {
  state: ItemState;
  revealed: boolean;
  phaseEndsAt: number | null;
  serverNow: number;
  results: ResultsView | null;
}

/** Typed for the add-in. The server sees every payload as `unknown` and validates it (see Untrusted). */
export interface PresenterClientEvents {
  'deck:upsert': (payload: z.input<typeof deckUpsertSchema>, ack: (res: Ack<{ joinCode: string }>) => void) => void;
  'item:upsert': (payload: z.input<typeof slideItemConfigSchema>, ack: (res: Ack<ItemSnapshot>) => void) => void;
  'item:activate': (payload: z.input<typeof itemActivateSchema>, ack: (res: Ack<ItemSnapshot>) => void) => void;
  'item:deactivate': (payload: z.input<typeof itemRefSchema>, ack: (res: Ack) => void) => void;
  'item:reveal': (payload: z.input<typeof itemRefSchema>, ack: (res: Ack<ItemSnapshot>) => void) => void;
  'item:close': (payload: z.input<typeof itemRefSchema>, ack: (res: Ack<ItemSnapshot>) => void) => void;
  'item:reopen': (payload: z.input<typeof itemRefSchema>, ack: (res: Ack<ItemSnapshot>) => void) => void;
  'item:reset': (payload: z.input<typeof itemRefSchema>, ack: (res: Ack<ItemSnapshot>) => void) => void;
  'response:hide': (payload: z.input<typeof responseHideSchema>, ack: (res: Ack) => void) => void;
  'qa:hide': (payload: z.input<typeof qaRefSchema>, ack: (res: Ack) => void) => void;
  'qa:answered': (payload: z.input<typeof qaAnsweredSchema>, ack: (res: Ack) => void) => void;
  'export:token': (payload: Record<string, never>, ack: (res: Ack<{ url: string }>) => void) => void;
}

export interface PresenterServerEvents {
  'deck:state': (state: PresenterDeckState) => void;
  'results:update': (results: ResultsView) => void;
  'participants:count': (payload: { count: number }) => void;
  'item:state': (payload: ItemStateMessage) => void;
  'leaderboard:update': (payload: LeaderboardView) => void;
  'qa:update': (payload: QaList) => void;
}

// ---------------------------------------------------------------------------
// Participant -> server payloads

export const responseSubmitSchema = z.object({
  itemId: uuidSchema,
  clientResponseId: uuidSchema,
  payload: responsePayloadSchema,
});
export const qaSubmitSchema = z.object({
  clientQaId: uuidSchema,
  text: z.string().check(z.trim(), z.minLength(1), z.maxLength(LIMITS.qaMax)),
});
export const nicknameSchema = z.object({
  nickname: z.string().check(z.trim(), z.minLength(LIMITS.nicknameMin), z.maxLength(LIMITS.nicknameMax)),
});
export const optionRefSchema = z.object({ optionId: shortIdSchema });

export interface ParticipantClientEvents {
  'response:submit': (payload: z.input<typeof responseSubmitSchema>, ack: (res: Ack<{ mine: MyResponseState }>) => void) => void;
  'item:mine': (payload: z.input<typeof itemRefSchema>, ack: (res: Ack<{ mine: MyResponseState }>) => void) => void;
  'qa:submit': (payload: z.input<typeof qaSubmitSchema>, ack: (res: Ack<{ id: string }>) => void) => void;
  'qa:upvote': (payload: z.input<typeof qaRefSchema>, ack: (res: Ack) => void) => void;
  'qa:unvote': (payload: z.input<typeof qaRefSchema>, ack: (res: Ack) => void) => void;
  'nickname:set': (payload: z.input<typeof nicknameSchema>, ack: (res: Ack<{ nickname: string }>) => void) => void;
}

export interface ParticipantServerEvents {
  'deck:state': (state: ParticipantDeckState) => void;
  me: (payload: Me) => void;
  'results:update': (results: ResultsView) => void;
  'quiz:result': (result: QuizResult) => void;
  'qa:update': (payload: QaList) => void;
  'qa:mine': (payload: QaMine) => void;
}

// ---------------------------------------------------------------------------

type AckOf<F> = F extends (payload: never, ack: infer A) => void ? A : never;

/** Server-side view of client events: payload is untrusted, and the ack may be missing. */
export type Untrusted<T> = {
  [K in keyof T]: (payload: unknown, ack?: AckOf<T[K]>) => void;
};

export const NAMESPACES = { presenter: '/presenter', participant: '/participant' } as const;
