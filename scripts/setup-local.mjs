// One-time setup for running Pulse on this computer (Windows or Mac), no Docker needed:
//   1. writes .env with random secrets (if missing),
//   2. installs a trusted localhost certificate (office-addin-dev-certs; Windows asks for confirmation,
//      the Mac asks for your password),
//   3. builds everything.
//   4. registers the add-in with PowerPoint (Insert → My Add-ins → Developer/Shared add-ins).
// Afterwards: `pnpm start` and open https://localhost:3443
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const envFile = join(root, '.env');
const isWindows = process.platform === 'win32';
const run = (cmd, args) => {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) {
    console.error(`\nStep failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
};

if (!existsSync(envFile)) {
  const secret = (n) => randomBytes(n).toString('base64url');
  writeFileSync(
    envFile,
    [
      '# Local mode: Pulse on this computer with the embedded database (see README.md).',
      'NODE_ENV=production',
      'PORT=3443',
      '# Only this computer (and a tunnel running on it) can reach Pulse:',
      'HOST=127.0.0.1',
      'APP_DOMAIN=localhost:3443',
      '# For phones, put your tunnel address here (see README.md, "Phones"), then restart:',
      '# PUBLIC_BASE_URL=https://example.trycloudflare.com',
      'DEV_CERTS=true',
      'PGLITE_DIR=.data/pglite',
      `EXPORT_TOKEN_SECRET=${secret(32)}`,
      `PARTICIPANT_HASH_SALT=${secret(24)}`,
      'RETENTION_DAYS=90',
      'LOG_LEVEL=info',
      'TZ=Europe/Vienna',
      '',
    ].join('\n'),
  );
  console.log('Created .env (local mode, random secrets).');
} else {
  console.log('.env exists, keeping it.');
}

run('pnpm', ['exec', 'office-addin-dev-certs', 'install']);
run('pnpm', ['build']);

console.log('\n> pnpm addin:register');
const registered = spawnSync('pnpm', ['addin:register'], { stdio: 'inherit', shell: isWindows }).status === 0;
if (!registered) console.warn('Could not register the add-in automatically. See docs/sideloading.md.');

console.log('\nDone. Start Pulse with:  pnpm start   →   https://localhost:3443');
console.log('In PowerPoint: Insert → My Add-ins → Developer Add-ins (Windows) / My Add-ins (Mac) → Pulse.');
