import {
  DISPLAY,
  LIMITS,
  RATE_LIMITS,
  TIMING,
  deckSettingsSchema,
  type Ack,
  type DeckSettings,
  type ErrorCode,
  type ItemSnapshot,
  type LeaderboardView,
  type MyResponseState,
  type ParticipantDeckState,
  type ParticipantServerEvents,
  type PresenterDeckState,
  type PresenterServerEvents,
  type QaList,
  type QuestionConfig,
  type QuizConfig,
  type QuizResult,
  type ResponsePayload,
  type SlideItemConfig,
} from '@pulse/shared';
import { toPublicPayload, type StoredPayload } from '../domain/payloads';
import { SlidingWindowLimiter } from '../domain/rateLimit';
import { quizPoints, rankLeaderboard } from '../domain/scoring';
import { hashSecret, secretMatches } from '../domain/secret';
import { debounce, trailingThrottle, type Throttled } from '../domain/throttle';
import type { TokenService } from '../domain/tokens';
import { normaliseWord } from '../domain/words';
import { computeResults, type LiveResponse } from './results';
import type { ItemRow, Store } from './store';
import { initialActiveState, toPublicItemView } from './views';

type Args<E, K extends keyof E> = E[K] extends (...args: infer A) => void ? A : never;

export interface Broadcaster {
  toPresenters<K extends keyof PresenterServerEvents>(deckId: string, event: K, ...args: Args<PresenterServerEvents, K>): void;
  toAudience<K extends keyof ParticipantServerEvents>(deckId: string, event: K, ...args: Args<ParticipantServerEvents, K>): void;
  toParticipant<K extends keyof ParticipantServerEvents>(
    deckId: string,
    participantId: string,
    event: K,
    ...args: Args<ParticipantServerEvents, K>
  ): void;
}

export interface HubLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

/** Timer source for quiz phases and the activation grace period; injectable for deterministic tests. */
export type TimerHandle = ReturnType<typeof setTimeout> | number;

export interface Scheduler {
  set: (fn: () => void, ms: number) => TimerHandle;
  clear: (handle: TimerHandle) => void;
}

const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => {
    clearTimeout(handle);
  },
};

export interface HubOptions {
  store: Store;
  broadcaster: Broadcaster;
  tokens: TokenService;
  publicBaseUrl: string;
  retentionDays: number;
  logger: HubLogger;
  now?: () => number;
  /** Override timings in tests. */
  timing?: Partial<Timing>;
  scheduler?: Scheduler;
}

type Timer = TimerHandle;
export type Timing = Record<keyof typeof TIMING, number>;

class HubError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

interface Ranking {
  byParticipant: Map<string, { rank: number; points: number }>;
  view: LeaderboardView;
}

class ItemRuntime {
  responses: LiveResponse[] = [];
  readonly clientIds = new Set<string>();
  generation = 0;
  timer: Timer | null = null;
  presenterThrottle: Throttled | null = null;
  participantThrottle: Throttled | null = null;

  constructor(
    public config: SlideItemConfig,
    public state: ItemRow['state'],
    public revealed: boolean,
    public phaseEndsAt: number | null,
  ) {}

  get id(): string {
    return this.config.id;
  }

  get question(): QuestionConfig | null {
    return this.config.kind === 'question' ? this.config : null;
  }

  get quiz(): QuizConfig | null {
    return this.config.kind === 'question' && this.config.type === 'quiz' ? this.config : null;
  }

  /** For quizzes: when the answering phase started (derived, so it survives restarts). */
  get answeringStartedAt(): number | null {
    const quiz = this.quiz;
    if (!quiz || this.state !== 'answering' || this.phaseEndsAt === null) return null;
    return this.phaseEndsAt - quiz.timeLimitSec * 1000;
  }

  dispose(scheduler: Scheduler): void {
    if (this.timer) scheduler.clear(this.timer);
    this.timer = null;
    this.presenterThrottle?.cancel();
    this.participantThrottle?.cancel();
  }
}

class DeckRuntime {
  activeItemId: string | null;
  readonly holders = new Set<string>();
  graceTimer: Timer | null = null;
  readonly items = new Map<string, ItemRuntime>();
  readonly itemLoads = new Map<string, Promise<ItemRuntime | null>>();
  readonly presenterSockets = new Set<string>();
  readonly participantSockets = new Map<string, Set<string>>();
  /** Nicknames of participants seen since the deck was loaded (quiz answers need one). */
  readonly nicknames = new Map<string, string | null>();
  ranking: Ranking | null = null;
  lastTouch = 0;
  evictTimer: Timer | null = null;
  countDebounce: Throttled | null = null;
  qaThrottle: Throttled | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly id: string,
    public joinCode: string,
    public settings: DeckSettings,
    activeItemId: string | null,
  ) {
    this.activeItemId = activeItemId;
  }

  /** Serialises presenter operations on this deck. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  get empty(): boolean {
    return this.presenterSockets.size === 0 && this.participantSockets.size === 0;
  }

  dispose(scheduler: Scheduler): void {
    if (this.graceTimer) scheduler.clear(this.graceTimer);
    if (this.evictTimer) clearTimeout(this.evictTimer);
    this.countDebounce?.cancel();
    this.qaThrottle?.cancel();
    for (const item of this.items.values()) item.dispose(scheduler);
  }
}

export interface PresenterSession {
  deckId: string;
  state: PresenterDeckState;
}

export interface ParticipantSession {
  deckId: string;
  state: ParticipantDeckState;
  nickname: string | null;
}

/** In-memory realtime state per deck, backed by the store (§5.3–§5.6). */
export class Hub {
  private readonly decks = new Map<string, DeckRuntime>();
  private readonly deckLoads = new Map<string, Promise<DeckRuntime | null>>();
  private readonly submissionLimiter: SlidingWindowLimiter;
  private readonly qaLimiter: SlidingWindowLimiter;
  private readonly creationLimiter: SlidingWindowLimiter;
  private readonly now: () => number;
  private readonly timing: Timing;
  private readonly scheduler: Scheduler;
  private closed = false;

  constructor(private readonly opts: HubOptions) {
    this.now = opts.now ?? Date.now;
    this.timing = { ...TIMING, ...opts.timing };
    this.scheduler = opts.scheduler ?? realScheduler;
    this.submissionLimiter = new SlidingWindowLimiter(
      RATE_LIMITS.submissionsPerWindow,
      RATE_LIMITS.submissionWindowMs,
      this.now,
    );
    this.qaLimiter = new SlidingWindowLimiter(RATE_LIMITS.qaPerDeckPerHour, 3_600_000, this.now);
    this.creationLimiter = new SlidingWindowLimiter(RATE_LIMITS.deckCreationsPerHour, 3_600_000, this.now);
  }

  private get store(): Store {
    return this.opts.store;
  }

  private get out(): Broadcaster {
    return this.opts.broadcaster;
  }

  // ===========================================================================
  // Loading

  private async loadDeck(deckId: string): Promise<DeckRuntime | null> {
    const cached = this.decks.get(deckId);
    if (cached) return cached;
    const pending = this.deckLoads.get(deckId);
    if (pending) return pending;
    const load = (async () => {
      const row = await this.store.getDeck(deckId);
      if (!row) return null;
      const deck = new DeckRuntime(row.id, row.joinCode, deckSettingsSchema.parse(row.settings), row.activeItemId);
      this.decks.set(deck.id, deck);
      if (deck.activeItemId) {
        const item = await this.loadItem(deck, deck.activeItemId);
        if (!item) deck.activeItemId = null;
        // After a restart nobody holds the active item yet; presenters re-activate on reconnect.
        else this.startGrace(deck);
      }
      return deck;
    })();
    this.deckLoads.set(deckId, load);
    try {
      return await load;
    } finally {
      this.deckLoads.delete(deckId);
    }
  }

  private async loadItem(deck: DeckRuntime, itemId: string): Promise<ItemRuntime | null> {
    const cached = deck.items.get(itemId);
    if (cached) return cached;
    const pending = deck.itemLoads.get(itemId);
    if (pending) return pending;
    const load = (async () => {
      const row = await this.store.getItem(itemId);
      if (row?.deckId !== deck.id) return null;
      const item = new ItemRuntime(row.config, row.state, row.revealed, row.phaseEndsAt?.getTime() ?? null);
      const rows = await this.store.listResponses(itemId);
      item.responses = rows.map((r) => ({
        id: r.id,
        clientResponseId: r.clientResponseId,
        participantId: r.participantId,
        payload: r.payload,
        points: r.points,
        responseMs: r.responseMs,
        hidden: r.hidden,
        createdAt: r.createdAt.getTime(),
      }));
      for (const r of item.responses) item.clientIds.add(r.clientResponseId);
      deck.items.set(itemId, item);
      return item;
    })();
    deck.itemLoads.set(itemId, load);
    try {
      return await load;
    } finally {
      deck.itemLoads.delete(itemId);
    }
  }

  /** Upserts the config (from the add-in, the source of truth) into DB and memory. */
  private async upsertItem(deck: DeckRuntime, config: SlideItemConfig): Promise<ItemRuntime> {
    if (config.deckId !== deck.id) throw new HubError('UNAUTHORIZED');
    const existing = await this.store.getItem(config.id);
    if (existing && existing.deckId !== deck.id) throw new HubError('UNAUTHORIZED');
    await this.store.upsertItem(config);
    const item = await this.loadItem(deck, config.id);
    if (!item) throw new HubError('INTERNAL');
    item.config = config;
    return item;
  }

  /** Resume quiz timers after a restart (§5.6: timers are server-authoritative). */
  async restoreRunningQuizzes(): Promise<void> {
    const rows = await this.store.listRunningQuizzes();
    for (const row of rows) {
      const deck = await this.loadDeck(row.deckId);
      if (!deck) continue;
      const item = await this.loadItem(deck, row.id);
      if (item) this.resumeQuiz(deck, item);
    }
  }

  // ===========================================================================
  // Presenter

  async presenterConnect(deckId: string, deckSecret: string, socketId: string): Promise<PresenterSession> {
    let deck = await this.loadDeck(deckId);
    let created = false;
    if (deck) {
      const row = await this.store.getDeck(deckId);
      if (!row || !secretMatches(deckSecret, row.secretHash)) throw new HubError('UNAUTHORIZED');
    } else {
      // A new deck comes to exist on first presenter connect (§5.3). Global abuse ceiling, not per IP.
      if (!this.creationLimiter.take('global')) throw new HubError('RATE_LIMITED');
      const row = await this.store.createDeck(deckId, hashSecret(deckSecret), deckSettingsSchema.parse({}));
      if (row) created = true;
      else {
        const existing = await this.store.getDeck(deckId);
        if (!existing || !secretMatches(deckSecret, existing.secretHash)) throw new HubError('UNAUTHORIZED');
      }
      deck = await this.loadDeck(deckId);
      if (!deck) throw new HubError('INTERNAL');
      if (created) this.opts.logger.info({ deckId }, 'deck created');
    }
    deck.presenterSockets.add(socketId);
    this.cancelEviction(deck);
    void this.touch(deck, true);
    return { deckId: deck.id, state: this.presenterState(deck, created) };
  }

  /** Sends the follow-up snapshots a newly connected presenter needs. */
  async presenterReady(deckId: string): Promise<void> {
    const deck = this.decks.get(deckId);
    if (!deck) return;
    this.out.toPresenters(deck.id, 'participants:count', { count: deck.participantSockets.size });
    this.out.toPresenters(deck.id, 'qa:update', await this.qaList(deck));
    const ranking = await this.ranking(deck);
    this.out.toPresenters(deck.id, 'leaderboard:update', ranking.view);
  }

  presenterDisconnect(deckId: string, socketId: string): void {
    const deck = this.decks.get(deckId);
    if (!deck) return;
    deck.presenterSockets.delete(socketId);
    if (deck.holders.delete(socketId) && deck.holders.size === 0 && deck.activeItemId) this.startGrace(deck);
    this.scheduleEviction(deck);
  }

  private presenterState(deck: DeckRuntime, created: boolean): PresenterDeckState {
    return {
      deckId: deck.id,
      joinCode: deck.joinCode,
      created,
      settings: deck.settings,
      activeItemId: deck.activeItemId,
      publicBaseUrl: this.opts.publicBaseUrl,
      retentionDays: this.opts.retentionDays,
      serverNow: this.now(),
    };
  }

  async deckUpsert(deckId: string, settings: DeckSettings): Promise<{ joinCode: string }> {
    const deck = await this.requireDeck(deckId);
    return deck.run(async () => {
      deck.settings = settings;
      await this.store.updateDeckSettings(deck.id, settings);
      this.out.toPresenters(deck.id, 'deck:state', this.presenterState(deck, false));
      this.out.toAudience(deck.id, 'deck:state', this.participantState(deck));
      if (!settings.qaEnabled) deck.qaThrottle?.schedule();
      return { joinCode: deck.joinCode };
    });
  }

  async itemUpsert(deckId: string, config: SlideItemConfig): Promise<ItemSnapshot> {
    const deck = await this.requireDeck(deckId);
    return deck.run(async () => {
      const item = await this.upsertItem(deck, config);
      if (deck.activeItemId === item.id) {
        this.out.toAudience(deck.id, 'deck:state', this.participantState(deck));
        this.scheduleResults(deck, item);
      }
      return this.snapshot(item);
    });
  }

  async itemActivate(deckId: string, socketId: string, config: SlideItemConfig): Promise<ItemSnapshot> {
    const deck = await this.requireDeck(deckId);
    return deck.run(async () => {
      const item = await this.upsertItem(deck, config);
      this.cancelGrace(deck);
      const switched = deck.activeItemId !== item.id;
      if (switched) {
        deck.activeItemId = item.id;
        deck.holders.clear();
      }
      deck.holders.add(socketId);
      if (switched) await this.store.setActiveItem(deck.id, item.id);
      if (item.state === 'idle') {
        if (item.quiz) {
          if (item.quiz.startMode === 'auto') await this.startCountdown(deck, item);
        } else {
          await this.setState(deck, item, { state: initialActiveState(item.config), openedAt: true });
        }
      }
      if (switched) {
        this.out.toAudience(deck.id, 'deck:state', this.participantState(deck));
        this.out.toPresenters(deck.id, 'deck:state', this.presenterState(deck, false));
      }
      if (item.config.kind === 'leaderboard') {
        this.out.toPresenters(deck.id, 'leaderboard:update', (await this.ranking(deck)).view);
      }
      void this.touch(deck, true);
      return this.snapshot(item);
    });
  }

  async itemDeactivate(deckId: string, socketId: string, itemId: string): Promise<void> {
    const deck = await this.requireDeck(deckId);
    await deck.run(async () => {
      if (deck.activeItemId !== itemId) return;
      deck.holders.delete(socketId);
      // Only the last holder clears it; another item may have taken over meanwhile (no clobbering, §5.3).
      if (deck.holders.size === 0) await this.clearActive(deck);
    });
  }

  async itemReveal(deckId: string, itemId: string): Promise<ItemSnapshot> {
    return this.withItem(deckId, itemId, async (deck, item) => {
      if (item.quiz) {
        if (item.state === 'idle') await this.startCountdown(deck, item);
      } else if (!item.revealed) {
        await this.setState(deck, item, { revealed: true });
        this.scheduleResults(deck, item);
      }
    });
  }

  async itemClose(deckId: string, itemId: string): Promise<ItemSnapshot> {
    return this.withItem(deckId, itemId, async (deck, item) => {
      if (!item.quiz && item.state !== 'closed') await this.setState(deck, item, { state: 'closed' });
    });
  }

  async itemReopen(deckId: string, itemId: string): Promise<ItemSnapshot> {
    return this.withItem(deckId, itemId, async (deck, item) => {
      if (!item.quiz && item.state === 'closed') await this.setState(deck, item, { state: 'open' });
    });
  }

  async itemReset(deckId: string, itemId: string): Promise<ItemSnapshot> {
    return this.withItem(deckId, itemId, async (deck, item) => {
      await this.resetItem(deck, item);
    });
  }

  private async resetItem(deck: DeckRuntime, item: ItemRuntime): Promise<void> {
    item.generation += 1;
    if (item.timer) this.scheduler.clear(item.timer);
    item.timer = null;
    await this.store.deleteResponses(item.config.id);
    item.responses = [];
    item.clientIds.clear();
    const active = deck.activeItemId === item.config.id;
    if (item.quiz) {
      await this.setState(deck, item, { state: 'idle', revealed: false, phaseEndsAt: null });
      deck.ranking = null;
      if (active && item.quiz.startMode === 'auto') await this.startCountdown(deck, item);
      this.out.toPresenters(deck.id, 'leaderboard:update', (await this.ranking(deck)).view);
    } else {
      await this.setState(deck, item, { state: active ? 'open' : 'idle', revealed: false });
    }
    this.scheduleResults(deck, item);
  }

  /** Dashboard reset (no presenter socket). */
  async resetFromDashboard(deckId: string, itemId: string): Promise<boolean> {
    const deck = await this.loadDeck(deckId);
    if (!deck) return false;
    return deck.run(async () => {
      const item = await this.loadItem(deck, itemId);
      if (!item) return false;
      await this.resetItem(deck, item);
      return true;
    });
  }

  async deleteDeckData(deckId: string): Promise<void> {
    const deck = await this.loadDeck(deckId);
    if (deck) {
      await deck.run(async () => {
        await this.store.deleteDeckData(deckId);
        for (const item of deck.items.values()) item.dispose(this.scheduler);
        deck.items.clear();
        deck.activeItemId = null;
        deck.holders.clear();
        deck.ranking = null;
        this.out.toAudience(deck.id, 'deck:state', this.participantState(deck));
        this.out.toPresenters(deck.id, 'deck:state', this.presenterState(deck, false));
        this.out.toAudience(deck.id, 'qa:update', { items: [] });
        this.out.toPresenters(deck.id, 'qa:update', { items: [] });
      });
    } else {
      await this.store.deleteDeckData(deckId);
    }
  }

  async hideResponse(deckId: string, itemId: string, target: { responseId: number } | { wordKey: string }): Promise<void> {
    await this.withItem(deckId, itemId, async (deck, item) => {
      if ('responseId' in target) {
        await this.store.hideResponse(itemId, target.responseId);
        for (const r of item.responses) if (r.id === target.responseId) r.hidden = true;
      } else {
        await this.store.hideWordGroup(itemId, target.wordKey);
        for (const r of item.responses) {
          if (r.payload.type === 'word_cloud' && r.payload.key === target.wordKey) r.hidden = true;
        }
      }
      this.scheduleResults(deck, item);
    });
  }

  async qaModerate(deckId: string, qaItemId: string, patch: { hidden?: boolean; answered?: boolean }): Promise<void> {
    const deck = await this.requireDeck(deckId);
    const ok = await this.store.updateQa(deck.id, qaItemId, patch);
    if (!ok) throw new HubError('NOT_FOUND');
    this.scheduleQa(deck);
  }

  exportUrl(deckId: string): string {
    return `${this.opts.publicBaseUrl}/dashboard?t=${encodeURIComponent(this.opts.tokens.sign(deckId, 'entry'))}`;
  }

  // ===========================================================================
  // Active item and grace

  private startGrace(deck: DeckRuntime): void {
    this.cancelGrace(deck);
    deck.graceTimer = this.scheduler.set(() => {
      deck.graceTimer = null;
      void deck.run(async () => {
        if (deck.holders.size === 0 && deck.activeItemId) await this.clearActive(deck);
      });
    }, this.timing.activeGraceMs);
  }

  private cancelGrace(deck: DeckRuntime): void {
    if (deck.graceTimer) this.scheduler.clear(deck.graceTimer);
    deck.graceTimer = null;
  }

  private async clearActive(deck: DeckRuntime): Promise<void> {
    this.cancelGrace(deck);
    deck.activeItemId = null;
    deck.holders.clear();
    await this.store.setActiveItem(deck.id, null);
    this.out.toAudience(deck.id, 'deck:state', this.participantState(deck));
    this.out.toPresenters(deck.id, 'deck:state', this.presenterState(deck, false));
  }

  // ===========================================================================
  // State changes

  private async setState(
    deck: DeckRuntime,
    item: ItemRuntime,
    patch: { state?: ItemRow['state']; revealed?: boolean; phaseEndsAt?: number | null; openedAt?: boolean },
  ): Promise<void> {
    if (patch.state !== undefined) item.state = patch.state;
    if (patch.revealed !== undefined) item.revealed = patch.revealed;
    if (patch.phaseEndsAt !== undefined) item.phaseEndsAt = patch.phaseEndsAt;
    await this.store.setItemState(item.config.id, {
      state: item.state,
      revealed: item.revealed,
      phaseEndsAt: item.phaseEndsAt === null ? null : new Date(item.phaseEndsAt),
      ...(patch.openedAt ? { openedAt: new Date(this.now()) } : {}),
    });
    this.out.toPresenters(deck.id, 'item:state', {
      itemId: item.config.id,
      state: item.state,
      revealed: item.revealed,
      phaseEndsAt: item.phaseEndsAt,
      serverNow: this.now(),
    });
    if (deck.activeItemId === item.config.id) this.out.toAudience(deck.id, 'deck:state', this.participantState(deck));
  }

  private snapshot(item: ItemRuntime): ItemSnapshot {
    const question = item.question;
    return {
      state: item.state,
      revealed: item.revealed,
      phaseEndsAt: item.phaseEndsAt,
      serverNow: this.now(),
      results: question ? computeResults(question, item.responses) : null,
    };
  }

  private async withItem(
    deckId: string,
    itemId: string,
    fn: (deck: DeckRuntime, item: ItemRuntime) => Promise<void>,
  ): Promise<ItemSnapshot> {
    const deck = await this.requireDeck(deckId);
    return deck.run(async () => {
      const item = await this.loadItem(deck, itemId);
      if (!item) throw new HubError('NOT_FOUND');
      await fn(deck, item);
      return this.snapshot(item);
    });
  }

  private async requireDeck(deckId: string): Promise<DeckRuntime> {
    const deck = await this.loadDeck(deckId);
    if (!deck) throw new HubError('NOT_FOUND');
    return deck;
  }

  // ===========================================================================
  // Quiz engine (§5.6)

  private async startCountdown(deck: DeckRuntime, item: ItemRuntime): Promise<void> {
    await this.setState(deck, item, { state: 'countdown', phaseEndsAt: this.now() + this.timing.quizCountdownMs });
    this.scheduleQuizTimer(deck, item);
  }

  private resumeQuiz(deck: DeckRuntime, item: ItemRuntime): void {
    this.scheduleQuizTimer(deck, item);
  }

  private scheduleQuizTimer(deck: DeckRuntime, item: ItemRuntime): void {
    if (item.timer) this.scheduler.clear(item.timer);
    item.timer = null;
    if (this.closed || item.phaseEndsAt === null) return;
    const generation = item.generation;
    const fireAt = item.state === 'answering' ? item.phaseEndsAt + this.timing.quizLateGraceMs : item.phaseEndsAt;
    const run = (): void => {
      item.timer = null;
      if (item.generation !== generation) return;
      void deck
        .run(async () => {
          if (item.generation !== generation) return;
          if (item.state === 'countdown') await this.startAnswering(deck, item);
          else if (item.state === 'answering') await this.revealQuiz(deck, item);
        })
        .catch((error: unknown) => {
          this.opts.logger.error({ err: error, itemId: item.config.id }, 'quiz phase change failed');
        });
    };
    item.timer = this.scheduler.set(run, Math.max(0, fireAt - this.now()));
  }

  private async startAnswering(deck: DeckRuntime, item: ItemRuntime): Promise<void> {
    const quiz = item.quiz;
    if (!quiz) return;
    await this.setState(deck, item, { state: 'answering', phaseEndsAt: this.now() + quiz.timeLimitSec * 1000 });
    this.scheduleQuizTimer(deck, item);
  }

  private async revealQuiz(deck: DeckRuntime, item: ItemRuntime): Promise<void> {
    await this.setState(deck, item, { state: 'reveal', revealed: true, phaseEndsAt: null });
    deck.ranking = null;
    const ranking = await this.ranking(deck);
    this.scheduleResults(deck, item);
    for (const participantId of deck.participantSockets.keys()) {
      this.out.toParticipant(deck.id, participantId, 'quiz:result', this.quizResultFor(item, participantId, ranking));
    }
    this.out.toPresenters(deck.id, 'leaderboard:update', ranking.view);
  }

  private quizResultFor(item: ItemRuntime, participantId: string, ranking: Ranking): QuizResult {
    const own = item.responses.find((r) => r.participantId === participantId && !r.hidden);
    const quiz = item.quiz;
    const correct = own && quiz && own.payload.type === 'quiz' ? own.payload.optionId === quiz.correctOptionId : null;
    const entry = ranking.byParticipant.get(participantId);
    return {
      itemId: item.config.id,
      correct,
      points: own?.points ?? 0,
      totalPoints: entry?.points ?? 0,
      rank: entry?.rank ?? null,
      rankOf: ranking.byParticipant.size,
    };
  }

  private async ranking(deck: DeckRuntime): Promise<Ranking> {
    if (deck.ranking) return deck.ranking;
    const [rows, quizCount] = await Promise.all([
      this.store.leaderboardRows(deck.id),
      this.store.revealedQuizCount(deck.id),
    ]);
    const ranked = rankLeaderboard(
      rows.map((r) => ({
        participantId: r.participantId,
        nickname: r.nickname ?? '–',
        points: r.points,
        totalResponseMs: r.totalResponseMs,
      })),
    );
    const ranking: Ranking = {
      byParticipant: new Map(ranked.map((r) => [r.participantId, { rank: r.rank, points: r.points }])),
      view: {
        entries: ranked
          .slice(0, DISPLAY.leaderboardTop)
          .map((r) => ({ rank: r.rank, nickname: r.nickname, points: r.points })),
        players: ranked.length,
        quizCount,
      },
    };
    deck.ranking = ranking;
    return ranking;
  }

  // ===========================================================================
  // Results streaming (§5.4)

  private scheduleResults(deck: DeckRuntime, item: ItemRuntime): void {
    const question = item.question;
    if (!question) return;
    item.presenterThrottle ??= trailingThrottle(() => {
      const q = item.question;
      if (q) this.out.toPresenters(deck.id, 'results:update', computeResults(q, item.responses));
    }, this.timing.presenterResultsThrottleMs);
    item.presenterThrottle.schedule();
    const phoneAllowed =
      question.type === 'quiz' ? false : question.showOnPhone && (question.resultsVisibility === 'live' || item.revealed);
    if (phoneAllowed && deck.activeItemId === item.config.id) {
      item.participantThrottle ??= trailingThrottle(() => {
        const q = item.question;
        if (q && deck.activeItemId === item.config.id) {
          this.out.toAudience(deck.id, 'results:update', computeResults(q, item.responses));
        }
      }, this.timing.participantResultsThrottleMs);
      item.participantThrottle.schedule();
    }
  }

  // ===========================================================================
  // Participants

  async participantConnect(joinCode: string, participantId: string, socketId: string): Promise<ParticipantSession> {
    const row = await this.store.getDeckByJoinCode(joinCode);
    if (!row) throw new HubError('DECK_NOT_FOUND');
    const deck = await this.loadDeck(row.id);
    if (!deck) throw new HubError('DECK_NOT_FOUND');
    const { nickname } = await this.store.touchParticipant(deck.id, participantId);
    deck.nicknames.set(participantId, nickname);
    const sockets = deck.participantSockets.get(participantId) ?? new Set<string>();
    sockets.add(socketId);
    deck.participantSockets.set(participantId, sockets);
    this.cancelEviction(deck);
    this.scheduleCount(deck);
    return { deckId: deck.id, state: this.participantState(deck), nickname };
  }

  /** Follow-up data for a newly connected participant (Q&A list and own questions/votes). */
  async participantReady(deckId: string, participantId: string): Promise<void> {
    const deck = this.decks.get(deckId);
    if (!deck) return;
    this.out.toParticipant(deck.id, participantId, 'qa:update', await this.qaList(deck));
    this.out.toParticipant(deck.id, participantId, 'qa:mine', await this.store.myQa(deck.id, participantId));
    const active = deck.activeItemId ? deck.items.get(deck.activeItemId) : undefined;
    const question = active?.question;
    if (active && question && question.type !== 'quiz' && question.showOnPhone) {
      if (question.resultsVisibility === 'live' || active.revealed) {
        this.out.toParticipant(deck.id, participantId, 'results:update', computeResults(question, active.responses));
      }
    }
  }

  participantDisconnect(deckId: string, participantId: string, socketId: string): void {
    const deck = this.decks.get(deckId);
    if (!deck) return;
    const sockets = deck.participantSockets.get(participantId);
    sockets?.delete(socketId);
    if (sockets?.size === 0) deck.participantSockets.delete(participantId);
    this.scheduleCount(deck);
    this.scheduleEviction(deck);
  }

  participantState(deck: DeckRuntime): ParticipantDeckState {
    const active = deck.activeItemId ? deck.items.get(deck.activeItemId) : undefined;
    return {
      deck: { title: deck.settings.title, slideLanguage: deck.settings.slideLanguage, qaEnabled: deck.settings.qaEnabled },
      activeItem: active
        ? toPublicItemView(active.config, { state: active.state, revealed: active.revealed, phaseEndsAt: active.phaseEndsAt })
        : null,
      serverNow: this.now(),
    };
  }

  private scheduleCount(deck: DeckRuntime): void {
    deck.countDebounce ??= debounce(() => {
      this.out.toPresenters(deck.id, 'participants:count', { count: deck.participantSockets.size });
    }, this.timing.participantCountDebounceMs);
    deck.countDebounce.schedule();
  }

  async mine(deckId: string, participantId: string, itemId: string): Promise<MyResponseState> {
    const deck = await this.requireDeck(deckId);
    const item = await this.loadItem(deck, itemId);
    if (!item) throw new HubError('NOT_FOUND');
    return this.mineFor(deck, item, participantId);
  }

  private async mineFor(deck: DeckRuntime, item: ItemRuntime, participantId: string): Promise<MyResponseState> {
    const submissions: ResponsePayload[] = item.responses
      .filter((r) => r.participantId === participantId)
      .map((r) => toPublicPayload(r.payload));
    const quizResult = item.quiz && item.state === 'reveal' ? this.quizResultFor(item, participantId, await this.ranking(deck)) : null;
    return { itemId: item.config.id, submissions, quizResult };
  }

  async submit(
    deckId: string,
    participantId: string,
    input: { itemId: string; clientResponseId: string; payload: ResponsePayload },
  ): Promise<MyResponseState> {
    const deck = await this.requireDeck(deckId);
    if (deck.activeItemId !== input.itemId) throw new HubError('NOT_ACTIVE');
    const item = deck.items.get(input.itemId);
    const question = item?.question;
    if (!item || !question) throw new HubError('NOT_ACTIVE');

    // Idempotent retries: same clientResponseId -> same result (§7.2).
    if (item.clientIds.has(input.clientResponseId)) return this.mineFor(deck, item, participantId);
    if (!this.submissionLimiter.take(`${deck.id}:${participantId}`)) throw new HubError('RATE_LIMITED');

    const now = this.now();
    if (question.type === 'quiz') {
      if (item.state === 'reveal') throw new HubError('TOO_LATE');
      if (item.state !== 'answering' || item.phaseEndsAt === null) throw new HubError('NOT_ACTIVE');
      if (now > item.phaseEndsAt + this.timing.quizLateGraceMs) throw new HubError('TOO_LATE');
    } else if (item.state === 'closed') {
      throw new HubError('CLOSED');
    } else if (item.state !== 'open') {
      throw new HubError('NOT_ACTIVE');
    }

    const stored = this.validatePayload(question, input.payload);
    const own = item.responses.filter((r) => r.participantId === participantId);
    const limit =
      question.type === 'word_cloud' || question.type === 'open_text' ? question.entriesPerParticipant : 1;
    if (own.length >= limit) throw new HubError(limit === 1 ? 'ALREADY_ANSWERED' : 'LIMIT_REACHED');

    let points: number | null = null;
    let responseMs: number | null = null;
    if (question.type === 'quiz' && stored.type === 'quiz') {
      if (!deck.nicknames.get(participantId)) throw new HubError('NICKNAME_REQUIRED');
      const startedAt = item.answeringStartedAt ?? now;
      responseMs = Math.max(0, Math.min(now - startedAt, question.timeLimitSec * 1000));
      points = quizPoints(stored.optionId === question.correctOptionId, responseMs, question.timeLimitSec);
    }

    const hiddenKey =
      stored.type === 'word_cloud' &&
      item.responses.some((r) => r.hidden && r.payload.type === 'word_cloud' && r.payload.key === stored.key);
    const live: LiveResponse = {
      id: null,
      clientResponseId: input.clientResponseId,
      participantId,
      payload: stored,
      points,
      responseMs,
      hidden: hiddenKey,
      createdAt: now,
    };
    // Reserve synchronously so concurrent submissions see it (single process, §5.4).
    item.responses.push(live);
    item.clientIds.add(input.clientResponseId);
    const generation = item.generation;
    try {
      const { row } = await this.store.insertResponse({
        clientResponseId: live.clientResponseId,
        itemId: question.id,
        participantId,
        payload: stored,
        points,
        responseMs,
        hidden: live.hidden,
      });
      live.id = row.id;
      if (item.generation !== generation) {
        await this.store.hideResponse(question.id, row.id);
        throw new HubError('CLOSED');
      }
    } catch (error) {
      item.responses = item.responses.filter((r) => r !== live);
      item.clientIds.delete(input.clientResponseId);
      if (error instanceof HubError) throw error;
      this.opts.logger.error({ err: error, itemId: question.id }, 'response insert failed');
      throw new HubError('INTERNAL');
    }
    this.scheduleResults(deck, item);
    void this.touch(deck, false);
    return this.mineFor(deck, item, participantId);
  }

  private validatePayload(question: QuestionConfig, payload: ResponsePayload): StoredPayload {
    if (payload.type !== question.type) throw new HubError('INVALID_PAYLOAD');
    switch (payload.type) {
      case 'multiple_choice': {
        if (question.type !== 'multiple_choice') throw new HubError('INVALID_PAYLOAD');
        const ids = new Set(question.options.map((o) => o.id));
        const unique = new Set(payload.optionIds);
        const max = question.allowMultiple ? (question.maxSelections ?? question.options.length) : 1;
        if (unique.size !== payload.optionIds.length || unique.size > max) throw new HubError('INVALID_PAYLOAD');
        if (payload.optionIds.some((id) => !ids.has(id))) throw new HubError('INVALID_PAYLOAD');
        return payload;
      }
      case 'word_cloud': {
        const word = normaliseWord(payload.text);
        if (!word) throw new HubError('EMPTY_AFTER_NORMALISATION');
        return { type: 'word_cloud', text: word.text, key: word.key };
      }
      case 'open_text':
        if (payload.text.length > LIMITS.textMax) throw new HubError('INVALID_PAYLOAD');
        return payload;
      case 'scale': {
        if (question.type !== 'scale') throw new HubError('INVALID_PAYLOAD');
        const keys = Object.keys(payload.ratings);
        if (keys.length !== question.statements.length) throw new HubError('INVALID_PAYLOAD');
        for (const statement of question.statements) {
          const value = payload.ratings[statement.id];
          if (value === undefined || value < 1 || value > question.range) throw new HubError('INVALID_PAYLOAD');
        }
        return payload;
      }
      case 'quiz':
        if (question.type !== 'quiz' || !question.options.some((o) => o.id === payload.optionId)) {
          throw new HubError('INVALID_PAYLOAD');
        }
        return payload;
    }
  }

  async setNickname(deckId: string, participantId: string, requested: string): Promise<string> {
    const deck = await this.requireDeck(deckId);
    return deck.run(async () => {
      const others = (await this.store.listNicknames(deck.id)).filter((p) => p.id !== participantId);
      const taken = new Set(others.map((p) => p.nickname?.toLocaleLowerCase('de')).filter((n): n is string => !!n));
      const base = requested.replace(/\s+/g, ' ').trim();
      let nickname = base;
      for (let n = 2; taken.has(nickname.toLocaleLowerCase('de')); n++) {
        const suffix = ` ${n}`;
        nickname = base.slice(0, LIMITS.nicknameMax - suffix.length).trimEnd() + suffix;
      }
      await this.store.setNickname(deck.id, participantId, nickname);
      deck.nicknames.set(participantId, nickname);
      deck.ranking = null;
      this.out.toParticipant(deck.id, participantId, 'me', { nickname });
      return nickname;
    });
  }

  // ===========================================================================
  // Q&A

  private async qaList(deck: DeckRuntime): Promise<QaList> {
    if (!deck.settings.qaEnabled) return { items: [] };
    const rows = await this.store.listQa(deck.id);
    return {
      items: rows.map((r) => ({
        id: r.id,
        text: r.text,
        upvotes: r.upvotes,
        answered: r.answered,
        createdAt: r.createdAt.getTime(),
      })),
    };
  }

  private scheduleQa(deck: DeckRuntime): void {
    deck.qaThrottle ??= trailingThrottle(() => {
      void this.qaList(deck)
        .then((list) => {
          this.out.toAudience(deck.id, 'qa:update', list);
          this.out.toPresenters(deck.id, 'qa:update', list);
        })
        .catch((error: unknown) => {
          this.opts.logger.error({ err: error, deckId: deck.id }, 'qa broadcast failed');
        });
    }, this.timing.qaThrottleMs);
    deck.qaThrottle.schedule();
  }

  async qaSubmit(deckId: string, participantId: string, clientQaId: string, text: string): Promise<string> {
    const deck = await this.requireDeck(deckId);
    if (!deck.settings.qaEnabled) throw new HubError('CLOSED');
    const existing = await this.store.getQa(clientQaId);
    if (existing) {
      if (existing.deckId === deck.id && existing.participantId === participantId) return existing.id;
      throw new HubError('INVALID_PAYLOAD');
    }
    if (!this.qaLimiter.take(`${deck.id}:${participantId}`)) throw new HubError('RATE_LIMITED');
    const row = await this.store.insertQa({ id: clientQaId, deckId: deck.id, participantId, text });
    if (!row) throw new HubError('INVALID_PAYLOAD');
    this.scheduleQa(deck);
    void this.touch(deck, false);
    return row.id;
  }

  async qaVote(deckId: string, participantId: string, qaItemId: string, up: boolean): Promise<void> {
    const deck = await this.requireDeck(deckId);
    if (!deck.settings.qaEnabled) throw new HubError('CLOSED');
    const qa = await this.store.getQa(qaItemId);
    if (qa?.deckId !== deck.id || qa.hidden) throw new HubError('NOT_FOUND');
    if (!this.submissionLimiter.take(`${deck.id}:${participantId}`)) throw new HubError('RATE_LIMITED');
    if (await this.store.vote(qaItemId, participantId, up)) this.scheduleQa(deck);
  }

  // ===========================================================================
  // Housekeeping

  private async touch(deck: DeckRuntime, force: boolean): Promise<void> {
    const now = this.now();
    if (!force && now - deck.lastTouch < 60_000) return;
    deck.lastTouch = now;
    try {
      await this.store.touchDeck(deck.id);
    } catch (error) {
      this.opts.logger.warn({ err: error, deckId: deck.id }, 'touch failed');
    }
  }

  private scheduleEviction(deck: DeckRuntime): void {
    if (!deck.empty || deck.evictTimer) return;
    deck.evictTimer = setTimeout(() => {
      deck.evictTimer = null;
      const running = [...deck.items.values()].some((i) => i.timer !== null);
      if (deck.empty && !running && !deck.graceTimer) this.evict(deck.id);
    }, 10 * 60_000);
  }

  private cancelEviction(deck: DeckRuntime): void {
    if (deck.evictTimer) clearTimeout(deck.evictTimer);
    deck.evictTimer = null;
  }

  /** Drops a deck from memory (retention deleted it, or nobody is connected). */
  evict(deckId: string): void {
    const deck = this.decks.get(deckId);
    if (!deck) return;
    deck.dispose(this.scheduler);
    this.decks.delete(deckId);
  }

  close(): void {
    this.closed = true;
    for (const deck of this.decks.values()) deck.dispose(this.scheduler);
    this.decks.clear();
  }
}

export function isHubError(error: unknown): error is HubError {
  return error instanceof HubError;
}

export function toAck<T extends object>(promise: Promise<T>, logger: HubLogger): Promise<Ack<T>> {
  return promise.then(
    (value) => ({ ok: true as const, ...value }),
    (error: unknown) => {
      if (isHubError(error)) return { ok: false as const, error: error.code };
      logger.error({ err: error }, 'unexpected error in realtime handler');
      return { ok: false as const, error: 'INTERNAL' as const };
    },
  );
}
