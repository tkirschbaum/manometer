import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';

const API_PREFIXES = ['/api/', '/socket.io/', '/healthz'];

/** Serves the built SPAs (production and local mode): participant app at /, add-in at /addin/. */
export async function registerStatic(app: FastifyInstance, staticDir: string): Promise<void> {
  const participantDir = join(staticDir, 'participant', 'dist');
  const addinDir = join(staticDir, 'addin', 'dist');
  if (!existsSync(join(participantDir, 'index.html')) || !existsSync(join(addinDir, 'index.html'))) {
    app.log.warn({ staticDir }, 'built apps not found; run pnpm build');
  }
  const setHeaders = (reply: FastifyReply, path: string): void => {
    reply.header('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
  };
  await app.register(fastifyStatic, { root: participantDir, prefix: '/', index: false, wildcard: true, setHeaders });
  await app.register(fastifyStatic, {
    root: addinDir,
    prefix: '/addin/',
    index: false,
    decorateReply: false,
    wildcard: true,
    setHeaders,
  });

  const html = (dir: string): Buffer | null => {
    const file = join(dir, 'index.html');
    return existsSync(file) ? readFileSync(file) : null;
  };
  const participantHtml = html(participantDir);
  const addinHtml = html(addinDir);
  const sendHtml = (reply: FastifyReply, body: Buffer | null): FastifyReply =>
    body
      ? reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(body)
      : reply.code(503).type('text/plain').send('App not built. Run pnpm build.');

  app.get('/', (_req, reply) => sendHtml(reply, participantHtml));
  app.get('/addin', (_req, reply) => reply.redirect('/addin/'));
  app.get('/addin/', (_req, reply) => sendHtml(reply, addinHtml));

  // SPA fallback for client routes (/482913, /datenschutz, /dashboard, /addin/?harness=1 …).
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '/';
    if (req.method !== 'GET' || API_PREFIXES.some((p) => path.startsWith(p)) || /\.[a-z0-9]+$/i.test(path)) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
    return sendHtml(reply, path.startsWith('/addin') ? addinHtml : participantHtml);
  });
}
