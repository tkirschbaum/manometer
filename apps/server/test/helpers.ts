import {
  NAMESPACES,
  newDeckSecret,
  newShortId,
  newUuid,
  type Ack,
  type ParticipantClientEvents,
  type ParticipantServerEvents,
  type PresenterClientEvents,
  type PresenterServerEvents,
  type SlideItemConfig,
} from '@pulse/shared';
import { io, type Socket } from 'socket.io-client';
import { createApp, type CreateAppOptions, type PulseApp } from '../src/app';
import { createDatabase, type Database } from '../src/db/client';
import { parseEnv } from '../src/env';
import type { Scheduler, TimerHandle } from '../src/realtime/hub';

export type PresenterClient = Socket<PresenterServerEvents, PresenterClientEvents>;
export type ParticipantClient = Socket<ParticipantServerEvents, ParticipantClientEvents>;

/** Real Postgres when TEST_DATABASE_URL is set (CI, local cluster), otherwise in-memory PGlite. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export function testEnv(overrides: Record<string, string> = {}) {
  return parseEnv({
    NODE_ENV: 'test',
    PORT: '0',
    HOST: '127.0.0.1',
    LOG_LEVEL: 'silent',
    APP_DOMAIN: 'pulse.test',
    PGLITE_DIR: 'memory://',
    EXPORT_TOKEN_SECRET: 'x'.repeat(40),
    PARTICIPANT_HASH_SALT: 'test-salt-test-salt',
    ...(TEST_DATABASE_URL ? { DATABASE_URL: TEST_DATABASE_URL } : {}),
    ...overrides,
  });
}

export interface TestServer {
  pulse: PulseApp;
  url: string;
  database: Database;
  stop: () => Promise<void>;
}

export async function startServer(
  options: CreateAppOptions & { database?: Database } = {},
): Promise<TestServer> {
  const env = testEnv();
  const database = options.database ?? (await createDatabase(env));
  const pulse = await createApp(env, { serveApps: 'none', retention: false, ...options, database });
  const address = await pulse.listen();
  return {
    pulse,
    url: address.replace('0.0.0.0', '127.0.0.1'),
    database,
    stop: async () => {
      await pulse.close();
      if (!options.database) await database.close();
    },
  };
}

export function connectPresenter(url: string, deckId: string, deckSecret: string): Promise<PresenterClient> {
  const socket: PresenterClient = io(`${url}${NAMESPACES.presenter}`, {
    auth: { deckId, deckSecret },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  return connected(socket);
}

export function connectParticipant(url: string, joinCode: string, participantId = newUuid()): Promise<ParticipantClient> {
  const socket: ParticipantClient = io(`${url}${NAMESPACES.participant}`, {
    auth: { joinCode, participantId },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  return connected(socket);
}

/** Events received before a test starts waiting for them; filled from the moment the socket is created. */
const received = new WeakMap<Socket, { event: string; value: unknown }[]>();

function connected<S extends Socket>(socket: S): Promise<S> {
  const buffer: { event: string; value: unknown }[] = [];
  received.set(socket, buffer);
  socket.onAny((event: string, value: unknown) => {
    buffer.push({ event, value });
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => {
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

/** Emits with ack and resolves with the ack payload. */
export function call<T extends object>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`no ack for ${event}`));
    }, 5000);
    socket.emit(event, payload, (res: Ack<T>) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

/** Resolves with the first matching event, including ones that arrived before this call (consumed). */
export function next<T>(socket: Socket, event: string, predicate: (value: T) => boolean = () => true, timeoutMs = 5000): Promise<T> {
  const buffer = received.get(socket) ?? [];
  const index = buffer.findIndex((e) => e.event === event && predicate(e.value as T));
  if (index >= 0) {
    const [hit] = buffer.splice(0, index + 1).slice(-1);
    return Promise.resolve(hit?.value as T);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (value: T): void => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      const at = buffer.findIndex((e) => e.event === event && e.value === value);
      if (at >= 0) buffer.splice(0, at + 1);
      resolve(value);
    };
    socket.on(event, handler);
  });
}

export function newDeck(): { deckId: string; deckSecret: string } {
  return { deckId: newUuid(), deckSecret: newDeckSecret() };
}

export function mcConfig(deckId: string, overrides: Partial<Record<string, unknown>> = {}): SlideItemConfig {
  return {
    id: newUuid(),
    deckId,
    schemaVersion: 1,
    kind: 'question',
    type: 'multiple_choice',
    prompt: 'Wie war die Vorlesung?',
    resultsVisibility: 'live',
    showOnPhone: false,
    allowMultiple: false,
    options: [
      { id: 'a', label: 'Gut' },
      { id: 'b', label: 'Mittel' },
      { id: 'c', label: 'Schlecht' },
    ],
    ...overrides,
  };
}

export function quizConfig(deckId: string, overrides: Partial<Record<string, unknown>> = {}): SlideItemConfig {
  return {
    id: newUuid(),
    deckId,
    schemaVersion: 1,
    kind: 'question',
    type: 'quiz',
    prompt: 'Hauptstadt von Österreich?',
    resultsVisibility: 'live',
    showOnPhone: false,
    options: [
      { id: 'w', label: 'Wien' },
      { id: 'g', label: 'Graz' },
    ],
    correctOptionId: 'w',
    timeLimitSec: 20,
    startMode: 'auto',
    ...overrides,
  };
}

export const shortId = newShortId;

/** Manual clock + scheduler: timers fire only when the test advances time. */
export class ManualClock implements Scheduler {
  current = Date.UTC(2026, 9, 1, 10, 0, 0);
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private seq = 0;

  now = (): number => this.current;

  set = (fn: () => void, ms: number): number => {
    const id = ++this.seq;
    this.timers.push({ at: this.current + ms, fn, id });
    return id;
  };

  clear = (handle: TimerHandle): void => {
    this.timers = this.timers.filter((t) => t.id !== handle);
  };

  /** Moves time forward, firing due timers in order. */
  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    for (;;) {
      const due = this.timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.current = Math.max(this.current, due.at);
      due.fn();
      await new Promise((r) => setTimeout(r, 30));
    }
    this.current = target;
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
