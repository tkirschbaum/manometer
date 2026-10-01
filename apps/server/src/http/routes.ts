import { joinCodeSchema, uuidSchema } from '@pulse/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/client';
import { SlidingWindowLimiter } from '../domain/rateLimit';
import type { TokenService } from '../domain/tokens';
import type { Env } from '../env';
import type { Hub } from '../realtime/hub';
import type { Store } from '../realtime/store';
import { buildCsv, buildXlsx, exportFileName, loadExportData } from './export';

export interface RouteDeps {
  env: Env;
  database: Database;
  store: Store;
  hub: Hub;
  tokens: TokenService;
}

const sessionBodySchema = z.object({ token: z.string().min(10).max(512) });
const itemParamsSchema = z.object({ itemId: uuidSchema });
const exportParamsSchema = z.object({ file: z.string().regex(/^[0-9a-f-]{36}\.(csv|xlsx)$/) });

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { env, database, store, hub, tokens } = deps;

  // Join checks can be enumerated; allow a whole lecture hall behind one NAT address (§1.5).
  const joinLimiter = new SlidingWindowLimiter(1200, 60_000);

  app.get('/healthz', async (_req, reply) => {
    const db = await database.ping();
    return reply.code(db ? 200 : 503).send({ ok: db, db });
  });

  app.get('/api/join/:code', async (req, reply) => {
    if (!joinLimiter.take(req.ip)) return reply.code(429).send({ error: 'RATE_LIMITED' });
    const parsed = joinCodeSchema.safeParse((req.params as { code?: string }).code);
    if (!parsed.success) return reply.send({ exists: false });
    // Never leaks titles or anything else about the deck (§5.7).
    const deck = await store.getDeckByJoinCode(parsed.data);
    return reply.send({ exists: deck !== null });
  });

  const sessionDeck = (req: FastifyRequest): string | null => {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    return tokens.verify(bearer, 'session')?.d ?? null;
  };

  const unauthorized = (reply: FastifyReply): FastifyReply => reply.code(401).send({ error: 'UNAUTHORIZED' });

  app.post('/api/dashboard/session', async (req, reply) => {
    const body = sessionBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_PAYLOAD' });
    const entry = tokens.verify(body.data.token, 'entry');
    if (!entry) return unauthorized(reply);
    return reply.send({ session: tokens.sign(entry.d, 'session'), deckId: entry.d });
  });

  app.get('/api/dashboard', async (req, reply) => {
    const deckId = sessionDeck(req);
    if (!deckId) return unauthorized(reply);
    const deck = await store.getDeck(deckId);
    if (!deck) return reply.code(404).send({ error: 'NOT_FOUND' });
    const data = await loadExportData(store, deck);
    const participants = await store.listNicknames(deck.id);
    return reply.send({
      deck: {
        id: deck.id,
        title: deck.settings.title,
        joinCode: deck.joinCode,
        slideLanguage: deck.settings.slideLanguage,
      },
      participants: participants.length,
      items: data.items.map(({ row, responses }) => {
        const visible = responses.filter((r) => !r.hidden);
        return {
          id: row.id,
          kind: row.kind,
          type: row.type,
          prompt: row.config.kind === 'question' ? row.config.prompt : '',
          state: row.state,
          respondents: new Set(visible.map((r) => r.participantId)).size,
          responses: visible.length,
          createdAt: row.createdAt.getTime(),
        };
      }),
      qa: { total: data.qa.length, hidden: data.qa.filter((q) => q.hidden).length },
    });
  });

  app.post('/api/dashboard/items/:itemId/reset', async (req, reply) => {
    const deckId = sessionDeck(req);
    if (!deckId) return unauthorized(reply);
    const params = itemParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'INVALID_PAYLOAD' });
    const ok = await hub.resetFromDashboard(deckId, params.data.itemId);
    return ok ? reply.send({ ok: true }) : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.post('/api/dashboard/delete', async (req, reply) => {
    const deckId = sessionDeck(req);
    if (!deckId) return unauthorized(reply);
    await hub.deleteDeckData(deckId);
    return reply.send({ ok: true });
  });

  app.get('/api/export/:file', async (req, reply) => {
    const params = exportParamsSchema.safeParse(req.params);
    const token = (req.query as { t?: string }).t;
    if (!params.success) return reply.code(404).send({ error: 'NOT_FOUND' });
    const [deckId, ext] = params.data.file.split('.') as [string, 'csv' | 'xlsx'];
    const session = tokens.verify(token, 'session');
    if (session?.d !== deckId) return unauthorized(reply);
    const deck = await store.getDeck(deckId);
    if (!deck) return reply.code(404).send({ error: 'NOT_FOUND' });
    const data = await loadExportData(store, deck);
    const filename = exportFileName(deck, ext, env.TZ);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Cache-Control', 'no-store');
    if (ext === 'csv') {
      return reply.type('text/csv; charset=utf-8').send(buildCsv(data, env.participantHashSalt, env.TZ));
    }
    return reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .send(await buildXlsx(data, env.participantHashSalt, env.TZ));
  });
}
