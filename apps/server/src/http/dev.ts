import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

type Next = (err?: unknown) => void;
type Middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => void;

/** Development: both Vite apps in middleware mode inside this server, one origin (§12). */
export async function registerViteDev(app: FastifyInstance, staticDir: string): Promise<() => Promise<void>> {
  const { createServer } = await import('vite');
  const middie = (await import('@fastify/middie')).default;
  await app.register(middie);
  const make = (root: string, hmrPath: string) =>
    createServer({
      root,
      configFile: join(root, 'vite.config.ts'),
      server: { middlewareMode: true, hmr: { server: app.server, path: hmrPath } },
      appType: 'spa',
    });
  const participant = await make(join(staticDir, 'participant'), '/__hmr/participant');
  const addin = await make(join(staticDir, 'addin'), '/__hmr/addin');
  const skip = ['/api/', '/socket.io/', '/healthz'];
  const dispatch: Middleware = (req, res, next) => {
    const url = req.url ?? '/';
    if (skip.some((p) => url.startsWith(p))) {
      next();
      return;
    }
    const target = url.startsWith('/addin') ? addin : participant;
    target.middlewares(req, res, next);
  };
  (app as unknown as { use: (fn: Middleware) => void }).use(dispatch);
  return async () => {
    await participant.close();
    await addin.close();
  };
}
