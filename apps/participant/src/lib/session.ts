import {
  NAMESPACES,
  STORAGE_KEYS,
  meSchema,
  myResponseStateSchema,
  newUuid,
  participantDeckStateSchema,
  qaListSchema,
  qaMineSchema,
  quizResultSchema,
  resultsViewSchema,
  type Ack,
  type ErrorCode,
  type MyResponseState,
  type ParticipantClientEvents,
  type ParticipantDeckState,
  type ParticipantServerEvents,
  type PublicItemView,
  type QaItemView,
  type QuizResult,
  type ResponsePayload,
  type ResultsView,
} from '@pulse/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import * as z from 'zod/mini';
import { ServerClock } from './clock';
import { storage } from './storage';

type ParticipantSocket = Socket<ParticipantServerEvents, ParticipantClientEvents>;

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'notFound';

const pendingSchema = z.array(
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('response'),
      itemId: z.string(),
      clientResponseId: z.string(),
      payload: z.unknown(),
    }),
    z.object({ kind: z.literal('qa'), clientQaId: z.string(), text: z.string() }),
  ]),
);
type PendingEntry =
  | { kind: 'response'; itemId: string; clientResponseId: string; payload: ResponsePayload }
  | { kind: 'qa'; clientQaId: string; text: string };

export interface SessionState {
  status: ConnectionStatus;
  deck: ParticipantDeckState['deck'] | null;
  activeItem: PublicItemView | null;
  mine: MyResponseState | null;
  pending: PendingEntry[];
  results: ResultsView | null;
  quizResult: QuizResult | null;
  lastQuizResult: QuizResult | null;
  nickname: string | null;
  qa: QaItemView[];
  qaMine: ReadonlySet<string>;
  qaVoted: ReadonlySet<string>;
  error: ErrorCode | null;
  sending: boolean;
}

const ACK_TIMEOUT_MS = 8000;

/** One participant connection to one deck. React reads it through useSession. */
export class SessionController {
  private state: SessionState;
  private readonly listeners = new Set<() => void>();
  private socket: ParticipantSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  readonly clock = new ServerClock();

  constructor(
    readonly code: string,
    readonly participantId: string,
  ) {
    this.state = {
      status: 'connecting',
      deck: null,
      activeItem: null,
      mine: null,
      pending: this.loadPending(),
      results: null,
      quizResult: null,
      lastQuizResult: null,
      nickname: null,
      qa: [],
      qaMine: new Set(),
      qaVoted: new Set(),
      error: null,
      sending: false,
    };
  }

  // -- store ------------------------------------------------------------------

  getSnapshot = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  // -- pending queue (§7.2: queued and retried with the same client id) --------

  private get pendingKey(): string {
    return `${STORAGE_KEYS.pendingPrefix}${this.code}`;
  }

  private loadPending(): PendingEntry[] {
    try {
      const parsed = pendingSchema.safeParse(JSON.parse(storage.get(this.pendingKey) ?? '[]'));
      return parsed.success ? (parsed.data as PendingEntry[]) : [];
    } catch {
      return [];
    }
  }

  private setPending(pending: PendingEntry[]): void {
    if (pending.length) storage.set(this.pendingKey, JSON.stringify(pending));
    else storage.remove(this.pendingKey);
    this.set({ pending });
  }

  // -- connection ---------------------------------------------------------------

  connect(): void {
    this.disposed = false;
    const socket: ParticipantSocket = io(NAMESPACES.participant, {
      auth: { joinCode: this.code, participantId: this.participantId },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.set({ status: 'connected' });
      this.flushPending();
    });
    socket.on('disconnect', () => {
      if (!this.disposed && this.state.status !== 'notFound') this.set({ status: 'reconnecting' });
    });
    socket.on('connect_error', (error) => {
      if (error.message === 'DECK_NOT_FOUND') {
        this.set({ status: 'notFound' });
        socket.disconnect();
        return;
      }
      this.set({ status: this.state.deck ? 'reconnecting' : 'connecting' });
      // Middleware rejections are not retried by Socket.IO itself.
      if (!socket.active) this.scheduleRetry();
    });

    socket.on('deck:state', (raw) => {
      const parsed = participantDeckStateSchema.safeParse(raw);
      if (!parsed.success) return;
      this.onDeckState(parsed.data);
    });
    socket.on('me', (raw) => {
      const parsed = meSchema.safeParse(raw);
      if (parsed.success) this.set({ nickname: parsed.data.nickname });
    });
    socket.on('results:update', (raw) => {
      const parsed = resultsViewSchema.safeParse(raw);
      if (parsed.success && parsed.data.itemId === this.state.activeItem?.id) this.set({ results: parsed.data });
    });
    socket.on('quiz:result', (raw) => {
      const parsed = quizResultSchema.safeParse(raw);
      if (!parsed.success) return;
      const forActive = parsed.data.itemId === this.state.activeItem?.id;
      this.set({ lastQuizResult: parsed.data, ...(forActive ? { quizResult: parsed.data } : {}) });
    });
    socket.on('qa:update', (raw) => {
      const parsed = qaListSchema.safeParse(raw);
      if (parsed.success) this.set({ qa: parsed.data.items });
    });
    socket.on('qa:mine', (raw) => {
      const parsed = qaMineSchema.safeParse(raw);
      if (parsed.success) this.set({ qaMine: new Set(parsed.data.mine), qaVoted: new Set(parsed.data.voted) });
    });
  }

  private scheduleRetry(): void {
    if (this.retryTimer || this.disposed) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.disposed && this.socket && !this.socket.connected) this.socket.connect();
    }, 3000);
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  private onDeckState(next: ParticipantDeckState): void {
    this.clock.sample(next.serverNow);
    const previous = this.state.activeItem;
    const changed = previous?.id !== next.activeItem?.id;
    this.set({
      deck: next.deck,
      activeItem: next.activeItem,
      ...(changed ? { mine: null, results: null, quizResult: null, error: null } : {}),
    });
    const item = next.activeItem;
    if (item?.kind !== 'question') return;
    const revealedNow = item.type === 'quiz' && item.state === 'reveal' && previous?.state !== 'reveal';
    if (changed || revealedNow) this.refreshMine(item.id);
  }

  private refreshMine(itemId: string): void {
    this.socket?.timeout(ACK_TIMEOUT_MS).emit('item:mine', { itemId }, (err: Error | null, res?: Ack<{ mine: MyResponseState }>) => {
      if (err || !res?.ok) return;
      const parsed = myResponseStateSchema.safeParse(res.mine);
      if (parsed.success && parsed.data.itemId === this.state.activeItem?.id) {
        this.set({ mine: parsed.data, quizResult: parsed.data.quizResult ?? this.state.quizResult });
      }
    });
  }

  // -- actions ------------------------------------------------------------------

  submit(payload: ResponsePayload): void {
    const item = this.state.activeItem;
    if (!item) return;
    const entry: PendingEntry = { kind: 'response', itemId: item.id, clientResponseId: newUuid(), payload };
    this.setPending([...this.state.pending, entry]);
    this.set({ error: null });
    this.send(entry);
  }

  qaSubmit(text: string): void {
    const entry: PendingEntry = { kind: 'qa', clientQaId: newUuid(), text };
    this.setPending([...this.state.pending, entry]);
    this.set({ error: null });
    this.send(entry);
  }

  private flushPending(): void {
    for (const entry of this.state.pending) this.send(entry);
  }

  private drop(entry: PendingEntry): void {
    this.setPending(this.state.pending.filter((p) => p !== entry));
  }

  private send(entry: PendingEntry): void {
    const socket = this.socket;
    if (!socket?.connected) return;
    this.set({ sending: true });
    if (entry.kind === 'response') {
      socket
        .timeout(ACK_TIMEOUT_MS)
        .emit(
          'response:submit',
          { itemId: entry.itemId, clientResponseId: entry.clientResponseId, payload: entry.payload },
          (err: Error | null, res?: Ack<{ mine: MyResponseState }>) => {
            this.set({ sending: false });
            if (err || !res) return; // stays queued, retried on reconnect
            this.drop(entry);
            if (!res.ok) {
              if (entry.itemId === this.state.activeItem?.id && res.error !== 'NOT_ACTIVE') this.set({ error: res.error });
              return;
            }
            const parsed = myResponseStateSchema.safeParse(res.mine);
            if (parsed.success && parsed.data.itemId === this.state.activeItem?.id) this.set({ mine: parsed.data });
          },
        );
    } else {
      socket
        .timeout(ACK_TIMEOUT_MS)
        .emit('qa:submit', { clientQaId: entry.clientQaId, text: entry.text }, (err: Error | null, res?: Ack<{ id: string }>) => {
          this.set({ sending: false });
          if (err || !res) return;
          this.drop(entry);
          if (!res.ok) {
            this.set({ error: res.error });
            return;
          }
          this.set({ qaMine: new Set([...this.state.qaMine, res.id]) });
        });
    }
  }

  qaVote(qaItemId: string, up: boolean): void {
    const voted = new Set(this.state.qaVoted);
    if (up) voted.add(qaItemId);
    else voted.delete(qaItemId);
    this.set({ qaVoted: voted });
    this.socket?.timeout(ACK_TIMEOUT_MS).emit(up ? 'qa:upvote' : 'qa:unvote', { qaItemId }, (err: Error | null, res?: Ack) => {
      if (err || !res?.ok) {
        const revert = new Set(this.state.qaVoted);
        if (up) revert.delete(qaItemId);
        else revert.add(qaItemId);
        this.set({ qaVoted: revert, ...(res && !res.ok ? { error: res.error } : {}) });
      }
    });
  }

  setNickname(nickname: string): Promise<Ack<{ nickname: string }>> {
    return new Promise((resolve) => {
      const socket = this.socket;
      if (!socket?.connected) {
        resolve({ ok: false, error: 'INTERNAL' });
        return;
      }
      socket.timeout(ACK_TIMEOUT_MS).emit('nickname:set', { nickname }, (err: Error | null, res?: Ack<{ nickname: string }>) => {
        if (err || !res) {
          resolve({ ok: false, error: 'INTERNAL' });
          return;
        }
        if (res.ok) this.set({ nickname: res.nickname });
        resolve(res);
      });
    });
  }

  clearError(): void {
    this.set({ error: null });
  }
}

export function useSession(code: string, participantId: string): { state: SessionState; session: SessionController } {
  const [session] = useState(() => new SessionController(code, participantId));
  useEffect(() => {
    session.connect();
    return () => {
      session.dispose();
    };
  }, [session]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { state, session };
}

/** Pending submissions for the active item (shown as "queued" while offline). */
export function pendingFor(state: SessionState, itemId: string): ResponsePayload[] {
  const out: ResponsePayload[] = [];
  for (const p of state.pending) if (p.kind === 'response' && p.itemId === itemId) out.push(p.payload);
  return out;
}
