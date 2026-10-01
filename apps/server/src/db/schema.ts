import type { DeckSettings, ItemState, SlideItemConfig } from '@pulse/shared';
import {
  bigserial,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { StoredPayload } from '../domain/payloads';

// No IP addresses, user agents or other identifiers are stored anywhere (master prompt §5.1).

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

export const decks = pgTable(
  'decks',
  {
    id: uuid('id').primaryKey(),
    joinCode: char('join_code', { length: 6 }).notNull().unique(),
    secretHash: text('secret_hash').notNull(),
    title: text('title'),
    settings: jsonb('settings').$type<DeckSettings>().notNull(),
    activeItemId: uuid('active_item_id'),
    activeSince: timestamp('active_since', { withTimezone: true }),
    ...timestamps,
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('decks_last_activity_idx').on(t.lastActivityAt)],
);

export const slideItems = pgTable(
  'slide_items',
  {
    id: uuid('id').primaryKey(),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    type: text('type'),
    config: jsonb('config').$type<SlideItemConfig>().notNull(),
    configHash: text('config_hash').notNull(),
    state: text('state').$type<ItemState>().notNull().default('idle'),
    /** Deviation: §5.1 has no column for "results revealed" (on_reveal, correct answers); kept here so it survives restarts. */
    revealed: boolean('revealed').notNull().default(false),
    phaseEndsAt: timestamp('phase_ends_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('slide_items_deck_idx').on(t.deckId)],
);

export const participants = pgTable(
  'participants',
  {
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    /** Random UUID from the participant's browser. */
    id: uuid('id').notNull(),
    nickname: text('nickname'),
    ...timestamps,
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Deviation: §5.1 says "id pk" plus unique(deck_id, id). One browser id joins many decks, so the key is (deck_id, id).
  (t) => [primaryKey({ columns: [t.deckId, t.id] })],
);

export const responses = pgTable(
  'responses',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    clientResponseId: uuid('client_response_id').notNull().unique(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => slideItems.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id').notNull(),
    payload: jsonb('payload').$type<StoredPayload>().notNull(),
    points: integer('points'),
    responseMs: integer('response_ms'),
    hidden: boolean('hidden').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('responses_item_idx').on(t.itemId)],
);

export const qaItems = pgTable(
  'qa_items',
  {
    id: uuid('id').primaryKey(),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id').notNull(),
    text: text('text').notNull(),
    upvotes: integer('upvotes').notNull().default(0),
    answered: boolean('answered').notNull().default(false),
    hidden: boolean('hidden').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('qa_items_deck_idx').on(t.deckId)],
);

export const qaVotes = pgTable(
  'qa_votes',
  {
    qaItemId: uuid('qa_item_id')
      .notNull()
      .references(() => qaItems.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.qaItemId, t.participantId] })],
);
