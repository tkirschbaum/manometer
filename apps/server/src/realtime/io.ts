import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import {
  NAMESPACES,
  RATE_LIMITS,
  deckUpsertSchema,
  emptySchema,
  itemActivateSchema,
  itemRefSchema,
  nicknameSchema,
  participantAuthSchema,
  presenterAuthSchema,
  qaAnsweredSchema,
  qaRefSchema,
  qaSubmitSchema,
  responseHideSchema,
  responseSubmitSchema,
  slideItemConfigSchema,
  type Ack,
  type ParticipantClientEvents,
  type ParticipantDeckState,
  type PresenterDeckState,
  type ParticipantServerEvents,
  type PresenterClientEvents,
  type PresenterServerEvents,
  type Untrusted,
} from '@pulse/shared';
import { Server, type Namespace, type Socket } from 'socket.io';
import type { z } from 'zod';
import { SlidingWindowLimiter } from '../domain/rateLimit';
import { isHubError, toAck, type Broadcaster, type Hub, type HubLogger } from './hub';

interface PresenterData {
  deckId: string;
  initial?: PresenterDeckState;
}
interface ParticipantData {
  deckId: string;
  participantId: string;
  initial?: { state: ParticipantDeckState; nickname: string | null };
}

type PresenterNamespace = Namespace<Untrusted<PresenterClientEvents>, PresenterServerEvents, Record<string, never>, PresenterData>;
type ParticipantNamespace = Namespace<
  Untrusted<ParticipantClientEvents>,
  ParticipantServerEvents,
  Record<string, never>,
  ParticipantData
>;

export const rooms = {
  presenters: (deckId: string) => `deck:${deckId}:presenter`,
  audience: (deckId: string) => `deck:${deckId}:audience`,
  participant: (deckId: string, participantId: string) => `deck:${deckId}:p:${participantId}`,
};

export interface Realtime {
  io: Server;
  broadcaster: Broadcaster;
  attach: (hub: Hub) => void;
  close: () => Promise<void>;
}

export function createRealtime(
  httpServer: HttpServer | HttpsServer,
  options: { logger: HubLogger; trustProxy: boolean },
): Realtime {
  const io = new Server(httpServer, {
    maxHttpBufferSize: 4096, // §9
    serveClient: false,
    pingInterval: 20_000,
    pingTimeout: 25_000,
  });
  const presenters = io.of(NAMESPACES.presenter) as PresenterNamespace;
  const participants = io.of(NAMESPACES.participant) as ParticipantNamespace;

  // The Broadcaster interface carries the event typing; Socket.IO's decorated generics cannot be
  // matched generically, so the room handle is narrowed to a plain emitter here.
  type Emitter = { emit: (event: string, ...args: unknown[]) => boolean };
  const room = (nsp: Namespace, name: string): Emitter => nsp.to(name);
  const broadcaster: Broadcaster = {
    toPresenters(deckId, event, ...args) {
      room(presenters, rooms.presenters(deckId)).emit(event, ...args);
    },
    toAudience(deckId, event, ...args) {
      room(participants, rooms.audience(deckId)).emit(event, ...args);
    },
    toParticipant(deckId, participantId, event, ...args) {
      room(participants, rooms.participant(deckId, participantId)).emit(event, ...args);
    },
  };

  // Generous per-IP ceiling only: a whole lecture hall may share one NAT address (§1.5, §9). Memory only.
  const ipLimiter = new SlidingWindowLimiter(RATE_LIMITS.connectionsPerIpPerMinute, 60_000);
  const clientIp = (socket: Socket): string => {
    if (options.trustProxy) {
      const forwarded = socket.handshake.headers['x-forwarded-for'];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return socket.handshake.address;
  };
  const ipGuard = (socket: Socket, next: (err?: Error) => void): void => {
    if (ipLimiter.take(clientIp(socket))) next();
    else next(new Error('RATE_LIMITED'));
  };
  presenters.use(ipGuard);
  participants.use(ipGuard);

  const attach = (hub: Hub): void => {
    attachPresenters(presenters, hub, options.logger);
    attachParticipants(participants, hub, options.logger);
  };

  return {
    io,
    broadcaster,
    attach,
    close: () =>
      new Promise<void>((resolve) => {
        void io.close(() => {
          resolve();
        });
      }),
  };
}

function errorCode(error: unknown): string {
  return isHubError(error) ? error.code : 'INTERNAL';
}

/** Validates the payload with zod, runs the handler and always acks (if the client asked for an ack). */
function bind<S extends z.ZodType, R extends object>(
  socket: Socket,
  event: string,
  schema: S,
  logger: HubLogger,
  handler: (data: z.output<S>) => Promise<R>,
): void {
  socket.on(event, (payload: unknown, ack?: unknown) => {
    const respond = (result: Ack<R>): void => {
      if (typeof ack === 'function') (ack as (res: Ack<R>) => void)(result);
    };
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      // Never log payload content (§5.3, §10).
      logger.warn({ event, nsp: socket.nsp.name }, 'invalid payload');
      respond({ ok: false, error: 'INVALID_PAYLOAD' });
      return;
    }
    void toAck(handler(parsed.data), logger).then(respond);
  });
}

function attachPresenters(nsp: PresenterNamespace, hub: Hub, logger: HubLogger): void {
  nsp.use((socket, next) => {
    const auth = presenterAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    hub
      .presenterConnect(auth.data.deckId, auth.data.deckSecret, socket.id)
      .then((session) => {
        socket.data.deckId = session.deckId;
        socket.data.initial = session.state;
        next();
      })
      .catch((error: unknown) => {
        if (!isHubError(error)) logger.error({ err: error }, 'presenter connect failed');
        next(new Error(errorCode(error)));
      });
  });

  nsp.on('connection', (socket) => {
    const { deckId, initial } = socket.data;
    socket.data.initial = undefined;
    void socket.join(rooms.presenters(deckId));
    if (initial) socket.emit('deck:state', initial);
    void hub.presenterReady(deckId);
    socket.on('disconnect', () => {
      hub.presenterDisconnect(deckId, socket.id);
    });

    bind(socket, 'deck:upsert', deckUpsertSchema, logger, (d) => hub.deckUpsert(deckId, d.settings));
    bind(socket, 'item:upsert', slideItemConfigSchema, logger, (config) => hub.itemUpsert(deckId, config));
    bind(socket, 'item:activate', itemActivateSchema, logger, async (d) => {
      if (d.itemId !== d.config.id) throw new Error('itemId mismatch');
      return hub.itemActivate(deckId, socket.id, d.config);
    });
    bind(socket, 'item:deactivate', itemRefSchema, logger, async (d) => {
      await hub.itemDeactivate(deckId, socket.id, d.itemId);
      return {};
    });
    bind(socket, 'item:reveal', itemRefSchema, logger, (d) => hub.itemReveal(deckId, d.itemId));
    bind(socket, 'item:close', itemRefSchema, logger, (d) => hub.itemClose(deckId, d.itemId));
    bind(socket, 'item:reopen', itemRefSchema, logger, (d) => hub.itemReopen(deckId, d.itemId));
    bind(socket, 'item:reset', itemRefSchema, logger, (d) => hub.itemReset(deckId, d.itemId));
    bind(socket, 'response:hide', responseHideSchema, logger, async (d) => {
      await hub.hideResponse(deckId, d.itemId, 'responseId' in d ? { responseId: Number(d.responseId) } : { wordKey: d.wordKey });
      return {};
    });
    bind(socket, 'qa:hide', qaRefSchema, logger, async (d) => {
      await hub.qaModerate(deckId, d.qaItemId, { hidden: true });
      return {};
    });
    bind(socket, 'qa:answered', qaAnsweredSchema, logger, async (d) => {
      await hub.qaModerate(deckId, d.qaItemId, { answered: d.answered });
      return {};
    });
    bind(socket, 'export:token', emptySchema, logger, () => Promise.resolve({ url: hub.exportUrl(deckId) }));
  });
}

function attachParticipants(nsp: ParticipantNamespace, hub: Hub, logger: HubLogger): void {
  nsp.use((socket, next) => {
    const auth = participantAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) {
      next(new Error('INVALID_PAYLOAD'));
      return;
    }
    hub
      .participantConnect(auth.data.joinCode, auth.data.participantId, socket.id)
      .then((session) => {
        socket.data.deckId = session.deckId;
        socket.data.participantId = auth.data.participantId;
        socket.data.initial = { state: session.state, nickname: session.nickname };
        next();
      })
      .catch((error: unknown) => {
        if (!isHubError(error)) logger.error({ err: error }, 'participant connect failed');
        next(new Error(errorCode(error)));
      });
  });

  nsp.on('connection', (socket) => {
    const { deckId, participantId, initial } = socket.data;
    socket.data.initial = undefined;
    void socket.join([rooms.audience(deckId), rooms.participant(deckId, participantId)]);
    if (initial) {
      socket.emit('deck:state', initial.state);
      socket.emit('me', { nickname: initial.nickname });
    }
    void hub.participantReady(deckId, participantId);
    socket.on('disconnect', () => {
      hub.participantDisconnect(deckId, participantId, socket.id);
    });

    bind(socket, 'response:submit', responseSubmitSchema, logger, async (d) => ({
      mine: await hub.submit(deckId, participantId, d),
    }));
    bind(socket, 'item:mine', itemRefSchema, logger, async (d) => ({
      mine: await hub.mine(deckId, participantId, d.itemId),
    }));
    bind(socket, 'qa:submit', qaSubmitSchema, logger, async (d) => ({
      id: await hub.qaSubmit(deckId, participantId, d.clientQaId, d.text),
    }));
    bind(socket, 'qa:upvote', qaRefSchema, logger, async (d) => {
      await hub.qaVote(deckId, participantId, d.qaItemId, true);
      return {};
    });
    bind(socket, 'qa:unvote', qaRefSchema, logger, async (d) => {
      await hub.qaVote(deckId, participantId, d.qaItemId, false);
      return {};
    });
    bind(socket, 'nickname:set', nicknameSchema, logger, async (d) => ({
      nickname: await hub.setNickname(deckId, participantId, d.nickname),
    }));
  });
}
