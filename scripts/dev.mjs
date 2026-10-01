// `pnpm dev` (master prompt §12): HTTPS dev server on https://localhost:3443 with both Vite apps in
// middleware mode (one origin: / participant, /addin/ add-in, /api, /socket.io).
// Database: DATABASE_URL from .env (starts infra/docker-compose.dev.yml if it points to localhost and
// Docker is available), otherwise the embedded PGlite database in .data/pglite-dev.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const isWindows = process.platform === 'win32';

const dbUrl = process.env.DATABASE_URL;
if (dbUrl && /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(dbUrl)) {
  const docker = spawnSync('docker', ['compose', '-f', 'infra/docker-compose.dev.yml', 'up', '-d', '--wait'], {
    stdio: 'inherit',
    shell: isWindows,
  });
  if (docker.status !== 0) console.warn('Could not start Postgres via Docker; assuming it is already running.');
}

const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: process.env.DEV_PORT ?? '3443',
  APP_DOMAIN: process.env.DEV_APP_DOMAIN ?? 'localhost:3443',
  DEV_CERTS: process.env.DEV_CERTS ?? 'true',
  PGLITE_DIR: process.env.DEV_PGLITE_DIR ?? '.data/pglite-dev',
};
const child = spawn('pnpm', ['--filter', '@pulse/server', 'dev'], { stdio: 'inherit', env, shell: isWindows });
child.on('exit', (code) => process.exit(code ?? 0));
