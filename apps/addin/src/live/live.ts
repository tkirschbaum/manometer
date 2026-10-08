import {
  NAMESPACES,
  itemStateMessageSchema,
  leaderboardViewSchema,
  presenterDeckStateSchema,
  qaListSchema,
  resultsViewSchema,
  type Ack,
  type DeckSettings,
  type ItemSnapshot,
  type ItemState,
  type LeaderboardView,
  type PresenterClientEvents,
  type PresenterDeckState,
  type PresenterServerEvents,
  type QaItemView,
  type ResultsView,
  type SlideItemConfig,
} from '@pulse/shared';
import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { liveCache } from './cache';

type PresenterSocket = Socket<PresenterServerEvents, PresenterClientEvents>;

export type LiveStatus = 'idle' | 'connecting' | 'connected' | 'offline' | 'unauthorized';

export interface ItemLiveState {
  state: ItemState;
  revealed: boolean;
  phaseEndsAt: number | null;
}

export interface LiveState {
  status: LiveStatus;
  deck: PresenterDeckState | null;
  /** True once: the server created the deck on this connection (new deck, or recreated after retention). */
  createdOnConnect: boolean;
  item: ItemLiveState | null;
  results: ResultsView | null;
  participants: number;
  leaderboard: LeaderboardView | null;
  qa: QaItemView[];
  /** serverNow - local now, for quiz timers (§5.6). */
  clockOffset: number;
}

const ACK_TIMEOUT_MS = 8000;

const initialState: LiveState = {
  status: 'idle',
  deck: null,
  createdOnConnect: false,
  item: null,
  results: null,
  participants: 0,
  leaderboard: null,
  qa: [],
  clockOffset: 0,
};

/** Presenter connection of one add-in instance (§5.3). React reads it via useLive. */
export class Live {
  private state: LiveState = initialState;
  private readonly listeners = new Set<() => void>();
  private socket: PresenterSocket | null = null;
  private itemId: string | null = null;
  private connectedKey: string | null = null;
  private readonly connectHandlers = new Set<() => void>();
  private offsets: number[] = [];
  private deckId: string | null = null;
  private cacheTimer: ReturnType<typeof setTimeout> | null = null;

  getSnapshot = (): LiveState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<LiveState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
    if ('results' in patch || 'item' in patch || 'participants' in patch || 'leaderboard' in patch || 'qa' in patch) {
      this.scheduleCacheWrite();
    }
  }

  /** Persists the last known live data (at most once per second) for an instant start next time. */
  private scheduleCacheWrite(): void {
    if (this.cacheTimer) return;
    this.cacheTimer = setTimeout(() => {
      this.cacheTimer = null;
      const { item, results, participants, leaderboard, qa } = this.state;
      if (this.itemId && (item || results)) liveCache.writeItem(this.itemId, { item, results });
      if (this.deckId && this.state.status === 'connected')
        liveCache.writeDeck(this.deckId, { participants, leaderboard, qa });
    }, 1000);
  }

  private sampleClock(serverNow: number): void {
    this.offsets.push(serverNow - Date.now());
    if (this.offsets.length > 8) this.offsets.shift();
    this.set({ clockOffset: Math.max(...this.offsets) });
  }

  /** Called on every (re)connect, e.g. to push the full config and re-activate (§1.1). */
  onConnect(handler: () => void): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  /** Which item this instance shows; results and state of other items are ignored. */
  setItem(itemId: string | null): void {
    if (this.itemId === itemId) return;
    this.itemId = itemId;
    const cached = itemId ? liveCache.readItem(itemId) : null;
    this.state = { ...this.state, item: cached?.item ?? null, results: cached?.results ?? null };
    for (const l of this.listeners) l();
  }

  connect(deckId: string, deckSecret: string): void {
    const key = `${deckId}:${deckSecret}`;
    if (this.connectedKey === key && this.socket) return;
    this.disconnect();
    this.connectedKey = key;
    this.deckId = deckId;
    const cached = liveCache.readDeck(deckId);
    this.set({ status: 'connecting', ...(cached ?? {}) });
    const socket: PresenterSocket = io(NAMESPACES.presenter, {
      auth: { deckId, deckSecret },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    this.socket = socket;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    socket.on('connect', () => {
      this.set({ status: 'connected' });
      for (const handler of this.connectHandlers) handler();
    });
    socket.on('disconnect', () => {
      if (this.socket === socket) this.set({ status: 'offline' });
    });
    socket.on('connect_error', (error) => {
      if (error.message === 'UNAUTHORIZED') {
        this.set({ status: 'unauthorized' });
        return;
      }
      this.set({ status: 'offline' });
      // Middleware rejections are not retried automatically by Socket.IO.
      if (!socket.active && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (this.socket === socket && !socket.connected) socket.connect();
        }, 5000);
      }
    });
    socket.on('deck:state', (raw) => {
      const parsed = presenterDeckStateSchema.safeParse(raw);
      if (!parsed.success) return;
      this.sampleClock(parsed.data.serverNow);
      this.set({ deck: parsed.data, ...(parsed.data.created ? { createdOnConnect: true } : {}) });
    });
    socket.on('item:state', (raw) => {
      const parsed = itemStateMessageSchema.safeParse(raw);
      if (!parsed.success || parsed.data.itemId !== this.itemId) return;
      this.sampleClock(parsed.data.serverNow);
      this.set({
        item: { state: parsed.data.state, revealed: parsed.data.revealed, phaseEndsAt: parsed.data.phaseEndsAt },
      });
    });
    socket.on('results:update', (raw) => {
      const parsed = resultsViewSchema.safeParse(raw);
      if (parsed.success && parsed.data.itemId === this.itemId) this.set({ results: parsed.data });
    });
    socket.on('participants:count', (raw) => {
      if (typeof raw.count === 'number') this.set({ participants: raw.count });
    });
    socket.on('leaderboard:update', (raw) => {
      const parsed = leaderboardViewSchema.safeParse(raw);
      if (parsed.success) this.set({ leaderboard: parsed.data });
    });
    socket.on('qa:update', (raw) => {
      const parsed = qaListSchema.safeParse(raw);
      if (parsed.success) this.set({ qa: parsed.data.items });
    });
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.connectedKey = null;
    this.deckId = null;
    this.offsets = [];
    if (this.cacheTimer) clearTimeout(this.cacheTimer);
    this.cacheTimer = null;
    this.state = { ...initialState, item: this.state.item, results: this.state.results };
    for (const l of this.listeners) l();
  }

  acknowledgeCreated(): void {
    this.set({ createdOnConnect: false });
  }

  private emit<T extends object>(event: keyof PresenterClientEvents, payload: unknown): Promise<Ack<T> | null> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.resolve(null);
    return new Promise((resolve) => {
      (
        socket.timeout(ACK_TIMEOUT_MS) as unknown as {
          emit: (ev: string, p: unknown, cb: (err: Error | null, res?: Ack<T>) => void) => void;
        }
      ).emit(event, payload, (err, res) => {
        resolve(err || !res ? null : res);
      });
    });
  }

  private applySnapshot(res: Ack<ItemSnapshot> | null): Ack<ItemSnapshot> | null {
    if (res?.ok) {
      this.sampleClock(res.serverNow);
      this.set({
        item: { state: res.state, revealed: res.revealed, phaseEndsAt: res.phaseEndsAt },
        ...(res.results ? { results: res.results } : {}),
      });
    }
    return res;
  }

  upsertDeck(settings: DeckSettings): Promise<Ack<{ joinCode: string }> | null> {
    return this.emit('deck:upsert', { settings });
  }

  async upsertItem(config: SlideItemConfig): Promise<boolean> {
    const res = this.applySnapshot(await this.emit<ItemSnapshot>('item:upsert', config));
    return res?.ok === true;
  }

  async activate(config: SlideItemConfig): Promise<boolean> {
    const res = this.applySnapshot(await this.emit<ItemSnapshot>('item:activate', { itemId: config.id, config }));
    return res?.ok === true;
  }

  async deactivate(itemId: string): Promise<void> {
    await this.emit('item:deactivate', { itemId });
  }

  async command(event: 'item:reveal' | 'item:close' | 'item:reopen' | 'item:reset', itemId: string): Promise<boolean> {
    const res = this.applySnapshot(await this.emit<ItemSnapshot>(event, { itemId }));
    return res?.ok === true;
  }

  async hideResponse(itemId: string, target: { responseId: string } | { wordKey: string }): Promise<void> {
    await this.emit('response:hide', { itemId, ...target });
  }

  async hideQa(qaItemId: string): Promise<void> {
    await this.emit('qa:hide', { qaItemId });
  }

  async markAnswered(qaItemId: string, answered: boolean): Promise<void> {
    await this.emit('qa:answered', { qaItemId, answered });
  }

  async exportUrl(): Promise<string | null> {
    const res = await this.emit<{ url: string }>('export:token', {});
    return res?.ok ? res.url : null;
  }
}

export function useLive(live: Live): LiveState {
  return useSyncExternalStore(live.subscribe, live.getSnapshot);
}
