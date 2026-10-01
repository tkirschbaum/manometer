import { PRODUCT_NAME } from '@pulse/shared';
import { createApp } from './app';
import { loadDotEnv, parseEnv } from './env';

loadDotEnv();
const env = parseEnv();
const pulse = await createApp(env);
await pulse.listen();

const log = pulse.app.log;
log.info(
  { publicBaseUrl: env.publicBaseUrl, database: pulse.database.kind, mode: env.NODE_ENV },
  `${PRODUCT_NAME} is running`,
);
if (pulse.database.kind === 'pglite') log.info({ dir: env.PGLITE_DIR }, 'using the embedded database (no DATABASE_URL set)');

let stopping = false;
const shutdown = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'shutting down');
  pulse
    .close()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    });
};
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
