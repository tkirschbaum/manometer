import type { DeckSettings, ItemState, SlideItemConfig } from '@pulse/shared';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { decks, participants, qaItems, qaVotes, responses, slideItems } from '../db/schema';
import { allocateJoinCode } from '../domain/joinCode';
import type { StoredPayload } from '../domain/payloads';
import { configHash } from '../domain/secret';

export type DeckRow = typeof decks.$inferSelect;
export type ItemRow = typeof slideItems.$inferSelect;
export type ResponseRow = typeof responses.$inferSelect;
export type QaRow = typeof qaItems.$inferSelect;

export interface NewResponse {
  clientResponseId: string;
  itemId: string;
  participantId: string;
  payload: StoredPayload;
  points: number | null;
  responseMs: number | null;
  hidden: boolean;
}

/** All database access of the realtime layer. Plain functions over Drizzle, no caching. */
export class Store {
  constructor(readonly db: Db) {}

  // -- decks ------------------------------------------------------------------

  async getDeck(id: string): Promise<DeckRow | null> {
    const rows = await this.db.select().from(decks).where(eq(decks.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async getDeckByJoinCode(code: string): Promise<DeckRow | null> {
    const rows = await this.db.select().from(decks).where(eq(decks.joinCode, code)).limit(1);
    return rows[0] ?? null;
  }

  /** Creates the deck with a fresh join code. Returns null if a deck with this id appeared concurrently. */
  async createDeck(id: string, secretHash: string, settings: DeckSettings): Promise<DeckRow | null> {
    const result: { row: DeckRow | null } = { row: null };
    await allocateJoinCode(async (code) => {
      const rows = await this.db
        .insert(decks)
        .values({ id, joinCode: code, secretHash, title: settings.title, settings })
        .onConflictDoNothing()
        .returning();
      result.row = rows[0] ?? null;
      // Done when inserted, or when the id already exists (created concurrently): then return null.
      return result.row !== null || (await this.getDeck(id)) !== null;
    });
    return result.row;
  }

  async updateDeckSettings(id: string, settings: DeckSettings): Promise<void> {
    await this.db
      .update(decks)
      .set({ settings, title: settings.title, lastActivityAt: new Date() })
      .where(eq(decks.id, id));
  }

  async setActiveItem(deckId: string, itemId: string | null): Promise<void> {
    await this.db
      .update(decks)
      .set({ activeItemId: itemId, activeSince: itemId ? new Date() : null, lastActivityAt: new Date() })
      .where(eq(decks.id, deckId));
  }

  async touchDeck(deckId: string): Promise<void> {
    await this.db.update(decks).set({ lastActivityAt: new Date() }).where(eq(decks.id, deckId));
  }

  /** Dashboard "delete all deck data": everything participants produced, plus the slide mirror. The deck row
   *  (join code, secret hash, settings) stays so the presentation keeps working with the same code. */
  async deleteDeckData(deckId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(slideItems).where(eq(slideItems.deckId, deckId));
      await tx.delete(qaItems).where(eq(qaItems.deckId, deckId));
      await tx.delete(participants).where(eq(participants.deckId, deckId));
      await tx.update(decks).set({ activeItemId: null, activeSince: null }).where(eq(decks.id, deckId));
    });
  }

  /** Retention (§5.8): delete decks inactive since before `cutoff`. Cascades to everything. */
  async deleteDecksInactiveSince(cutoff: Date): Promise<string[]> {
    const rows = await this.db.delete(decks).where(lt(decks.lastActivityAt, cutoff)).returning({ id: decks.id });
    return rows.map((r) => r.id);
  }

  // -- items ------------------------------------------------------------------

  async getItem(id: string): Promise<ItemRow | null> {
    const rows = await this.db.select().from(slideItems).where(eq(slideItems.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async listItems(deckId: string): Promise<ItemRow[]> {
    return this.db.select().from(slideItems).where(eq(slideItems.deckId, deckId)).orderBy(asc(slideItems.createdAt));
  }

  async listRunningQuizzes(): Promise<ItemRow[]> {
    return this.db
      .select()
      .from(slideItems)
      .where(and(eq(slideItems.type, 'quiz'), inArray(slideItems.state, ['countdown', 'answering'])));
  }

  async upsertItem(config: SlideItemConfig): Promise<ItemRow> {
    const hash = configHash(config);
    const type = config.kind === 'question' ? config.type : null;
    const rows = await this.db
      .insert(slideItems)
      .values({ id: config.id, deckId: config.deckId, kind: config.kind, type, config, configHash: hash })
      .onConflictDoUpdate({
        target: slideItems.id,
        set: { kind: config.kind, type, config, configHash: hash, updatedAt: new Date() },
        setWhere: eq(slideItems.deckId, config.deckId),
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Item belongs to another deck');
    return row;
  }

  async setItemState(
    id: string,
    patch: { state: ItemState; revealed: boolean; phaseEndsAt: Date | null; openedAt?: Date | null },
  ): Promise<void> {
    await this.db
      .update(slideItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(slideItems.id, id));
  }

  // -- responses --------------------------------------------------------------

  async listResponses(itemId: string): Promise<ResponseRow[]> {
    return this.db.select().from(responses).where(eq(responses.itemId, itemId)).orderBy(asc(responses.id));
  }

  /** Inserts once per clientResponseId; returns the stored row (new or existing). */
  async insertResponse(row: NewResponse): Promise<{ row: ResponseRow; inserted: boolean }> {
    const inserted = await this.db.insert(responses).values(row).onConflictDoNothing().returning();
    if (inserted[0]) return { row: inserted[0], inserted: true };
    const existing = await this.db
      .select()
      .from(responses)
      .where(eq(responses.clientResponseId, row.clientResponseId))
      .limit(1);
    if (!existing[0]) throw new Error('Response insert conflict without existing row');
    return { row: existing[0], inserted: false };
  }

  async deleteResponses(itemId: string): Promise<void> {
    await this.db.delete(responses).where(eq(responses.itemId, itemId));
  }

  async hideResponse(itemId: string, responseId: number): Promise<void> {
    await this.db
      .update(responses)
      .set({ hidden: true })
      .where(and(eq(responses.itemId, itemId), eq(responses.id, responseId)));
  }

  async hideWordGroup(itemId: string, key: string): Promise<void> {
    await this.db
      .update(responses)
      .set({ hidden: true })
      .where(and(eq(responses.itemId, itemId), sql`${responses.payload}->>'key' = ${key}`));
  }

  async leaderboardRows(
    deckId: string,
  ): Promise<{ participantId: string; nickname: string | null; points: number; totalResponseMs: number }[]> {
    return this.db
      .select({
        participantId: responses.participantId,
        nickname: participants.nickname,
        points: sql<number>`coalesce(sum(${responses.points}), 0)::int`,
        totalResponseMs: sql<number>`coalesce(sum(${responses.responseMs}), 0)::int`,
      })
      .from(responses)
      .innerJoin(slideItems, eq(slideItems.id, responses.itemId))
      .leftJoin(
        participants,
        and(eq(participants.deckId, slideItems.deckId), eq(participants.id, responses.participantId)),
      )
      .where(and(eq(slideItems.deckId, deckId), eq(slideItems.type, 'quiz'), eq(slideItems.state, 'reveal')))
      .groupBy(responses.participantId, participants.nickname);
  }

  async revealedQuizCount(deckId: string): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(slideItems)
      .where(and(eq(slideItems.deckId, deckId), eq(slideItems.type, 'quiz'), eq(slideItems.state, 'reveal')));
    return rows[0]?.n ?? 0;
  }

  // -- participants -----------------------------------------------------------

  async touchParticipant(deckId: string, participantId: string): Promise<{ nickname: string | null }> {
    const rows = await this.db
      .insert(participants)
      .values({ deckId, id: participantId })
      .onConflictDoUpdate({ target: [participants.deckId, participants.id], set: { lastSeenAt: new Date() } })
      .returning({ nickname: participants.nickname });
    return { nickname: rows[0]?.nickname ?? null };
  }

  async listNicknames(deckId: string): Promise<{ id: string; nickname: string | null }[]> {
    return this.db
      .select({ id: participants.id, nickname: participants.nickname })
      .from(participants)
      .where(eq(participants.deckId, deckId));
  }

  async setNickname(deckId: string, participantId: string, nickname: string): Promise<void> {
    await this.db
      .update(participants)
      .set({ nickname })
      .where(and(eq(participants.deckId, deckId), eq(participants.id, participantId)));
  }

  // -- Q&A --------------------------------------------------------------------

  async listQa(deckId: string): Promise<QaRow[]> {
    return this.db
      .select()
      .from(qaItems)
      .where(and(eq(qaItems.deckId, deckId), eq(qaItems.hidden, false)))
      .orderBy(desc(qaItems.createdAt))
      .limit(500);
  }

  async insertQa(row: { id: string; deckId: string; participantId: string; text: string }): Promise<QaRow | null> {
    const inserted = await this.db.insert(qaItems).values(row).onConflictDoNothing().returning();
    if (inserted[0]) return inserted[0];
    const existing = await this.db.select().from(qaItems).where(eq(qaItems.id, row.id)).limit(1);
    const found = existing[0];
    if (!found) return null;
    return found.deckId === row.deckId && found.participantId === row.participantId ? found : null;
  }

  async getQa(id: string): Promise<QaRow | null> {
    const rows = await this.db.select().from(qaItems).where(eq(qaItems.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async vote(qaItemId: string, participantId: string, up: boolean): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      if (up) {
        const inserted = await tx.insert(qaVotes).values({ qaItemId, participantId }).onConflictDoNothing().returning();
        if (!inserted[0]) return false;
        await tx
          .update(qaItems)
          .set({ upvotes: sql`${qaItems.upvotes} + 1` })
          .where(eq(qaItems.id, qaItemId));
        return true;
      }
      const deleted = await tx
        .delete(qaVotes)
        .where(and(eq(qaVotes.qaItemId, qaItemId), eq(qaVotes.participantId, participantId)))
        .returning();
      if (!deleted[0]) return false;
      await tx
        .update(qaItems)
        .set({ upvotes: sql`greatest(${qaItems.upvotes} - 1, 0)` })
        .where(eq(qaItems.id, qaItemId));
      return true;
    });
  }

  async myQa(deckId: string, participantId: string): Promise<{ mine: string[]; voted: string[] }> {
    const mine = await this.db
      .select({ id: qaItems.id })
      .from(qaItems)
      .where(and(eq(qaItems.deckId, deckId), eq(qaItems.participantId, participantId)));
    const voted = await this.db
      .select({ id: qaVotes.qaItemId })
      .from(qaVotes)
      .innerJoin(qaItems, eq(qaItems.id, qaVotes.qaItemId))
      .where(and(eq(qaItems.deckId, deckId), eq(qaVotes.participantId, participantId)));
    return { mine: mine.map((r) => r.id), voted: voted.map((r) => r.id) };
  }

  async countQaSince(deckId: string, participantId: string, since: Date): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(qaItems)
      .where(
        and(
          eq(qaItems.deckId, deckId),
          eq(qaItems.participantId, participantId),
          sql`${qaItems.createdAt} > ${since.toISOString()}`,
        ),
      );
    return rows[0]?.n ?? 0;
  }

  async updateQa(deckId: string, qaItemId: string, patch: { hidden?: boolean; answered?: boolean }): Promise<boolean> {
    const rows = await this.db
      .update(qaItems)
      .set(patch)
      .where(and(eq(qaItems.id, qaItemId), eq(qaItems.deckId, deckId)))
      .returning({ id: qaItems.id });
    return rows.length > 0;
  }

  /** All Q&A items including hidden ones, for exports. */
  async listQaForExport(deckId: string): Promise<QaRow[]> {
    return this.db.select().from(qaItems).where(eq(qaItems.deckId, deckId)).orderBy(asc(qaItems.createdAt));
  }
}
