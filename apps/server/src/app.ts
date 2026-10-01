import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { createDatabase, type Database } from './db/client';
import { TokenService } from './domain/tokens';
import type { Env } from './env';
import { registerViteDev } from './http/dev';
import { registerRoutes } from './http/routes';
import { registerSecurityHeaders } from './http/security';
import { registerStatic } from './http/static';
import { scheduleRetention } from './jobs/retention';
import { Hub, type Scheduler, type Timing } from './realtime/hub';
import { createRealtime } from './realtime/io';
import { Store } from './realtime/store';

export interface CreateAppOptions {
  database?: Database;
  /** 'vite' (development), 'static' (built apps) or 'none' (tests). Default derives from NODE_ENV. */
  serveApps?: 'vite' | 'static' | 'none';
  now?: () => number;
  timing?: Partial<Timing>;
  scheduler?: Scheduler;
  retention?: boolean;
}

export interface PulseApp {
  app: FastifyInstance;
  hub: Hub;
  store: Store;
  database: Database;
  tokens: TokenService;
  listen: () => Promise<string>;
  close: () => Promise<void>;
}

function loadTls(env: Env): { key: Buffer; cert: Buffer } | null {
  if (env.TLS_CERT_FILE && env.TLS_KEY_FILE) {
    return { cert: readFileSync(env.TLS_CERT_FILE), key: readFileSync(env.TLS_KEY_FILE) };
  }
  if (env.DEV_CERTS) {
    const dir = join(homedir(), '.office-addin-dev-certs');
    const cert = join(dir, 'localhost.crt');
    const key = join(dir, 'localhost.key');
    if (!existsSync(cert) || !existsSync(key)) {
      throw new Error(`DEV_CERTS=true but no certificates in ${dir}. Run: pnpm certs`);
    }
    return { cert: readFileSync(cert), key: readFileSync(key) };
  }
  return null;
}

export async function createApp(env: Env, options: CreateAppOptions = {}): Promise<PulseApp> {
  const tls = loadTls(env);
  const app = Fastify({
    logger: env.LOG_LEVEL === 'silent' ? false : { level: env.LOG_LEVEL },
    // Request logs would contain dashboard/export tokens in query strings (§10).
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 16 * 1024,
    ...(tls ? { https: tls } : {}),
  }) as unknown as FastifyInstance;

  const database = options.database ?? (await createDatabase(env));
  await database.migrate(env.migrationsDir);
  const store = new Store(database.db);
  const tokens = new TokenService(env.exportTokenSecret);
  const realtime = createRealtime(app.server, { logger: app.log, trustProxy: env.TRUST_PROXY });
  const hub = new Hub({
    store,
    broadcaster: realtime.broadcaster,
    tokens,
    publicBaseUrl: env.publicBaseUrl,
    retentionDays: env.RETENTION_DAYS,
    logger: app.log,
    ...(options.now ? { now: options.now } : {}),
    ...(options.timing ? { timing: options.timing } : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {}),
  });
  realtime.attach(hub);

  registerSecurityHeaders(app, env);
  registerRoutes(app, { env, database, store, hub, tokens });

  const serveApps = options.serveApps ?? (env.NODE_ENV === 'development' ? 'vite' : 'static');
  let closeVite: (() => Promise<void>) | null = null;
  if (serveApps === 'vite') closeVite = await registerViteDev(app, env.staticDir);
  else if (serveApps === 'static') await registerStatic(app, env.staticDir);

  await hub.restoreRunningQuizzes();

  const retention =
    options.retention === false
      ? null
      : scheduleRetention({
          store,
          retentionDays: env.RETENTION_DAYS,
          timeZone: env.TZ,
          logger: app.log,
          onDeleted: (ids) => {
            for (const id of ids) hub.evict(id);
          },
        });

  return {
    app,
    hub,
    store,
    database,
    tokens,
    listen: () => app.listen({ port: env.PORT, host: env.HOST }),
    close: async () => {
      retention?.stop();
      hub.close();
      await realtime.close();
      await app.close();
      await closeVite?.();
      if (!options.database) await database.close();
    },
  };
}
