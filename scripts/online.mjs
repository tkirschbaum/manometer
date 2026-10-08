// Pulse online in one step (local mode + free Cloudflare quick tunnel), so phones can join from anywhere:
//   1. finds cloudflared (installed, or downloads it once into .tools/ from Cloudflare's GitHub releases),
//   2. starts a quick tunnel to the local Pulse server and reads its address (https://….trycloudflare.com),
//   3. starts Pulse with PUBLIC_BASE_URL set to that address (overrides .env for this run only),
//   4. waits until the address answers and prints it. The slides pick up the new address by themselves.
// The address changes with every start; nothing has to be edited by hand. Ctrl+C (or closing the window) stops both.
// Usage: pnpm start:online   (Start-Pulse-Online.command / .cmd run this after the first-time setup)
// For tests: CLOUDFLARED=<path> uses that binary.
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const isWindows = process.platform === 'win32';
const toolsDir = join(root, '.tools');
/** The tunnel's own address (not api.trycloudflare.com, which appears in error messages). */
const TUNNEL_URL = /https:\/\/(?!api\.)[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/;

const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const port = process.env.PORT ?? '3443';
const tls = /^(1|true|yes)$/i.test(process.env.DEV_CERTS ?? '') || Boolean(process.env.TLS_CERT_FILE);
const localHost = process.env.HOST === '127.0.0.1' || !process.env.HOST ? '127.0.0.1' : 'localhost';
const target = `${tls ? 'https' : 'http'}://${localHost}:${port}`;
const adminUrl = `${tls ? 'https' : 'http'}://localhost:${port}/`;

const children = [];
let stopping = false;
function stop(code = 0) {
  process.exitCode = code;
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 300).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
// Never leave the tunnel or the server running without this window.
process.on('exit', () => {
  for (const child of children) child.kill();
});

function fail(message) {
  console.error(`\n${message}`);
  stop(1);
}

const works = (cmd) => {
  try {
    return spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: false }).status === 0;
  } catch {
    return false;
  }
};

/** Release asset for this computer (https://github.com/cloudflare/cloudflared/releases). */
function asset() {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? '386' : 'amd64';
  if (process.platform === 'darwin') return { name: `cloudflared-darwin-${arch}.tgz`, tgz: true };
  if (isWindows) return { name: `cloudflared-windows-${arch === 'arm64' ? 'amd64' : arch}.exe`, tgz: false };
  return { name: `cloudflared-linux-${arch}`, tgz: false };
}

async function download(dest) {
  const { name, tgz } = asset();
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${name}`;
  console.log(`Downloading cloudflared once (${name}) …`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  mkdirSync(toolsDir, { recursive: true });
  if (tgz) {
    const archive = join(toolsDir, name);
    writeFileSync(archive, body);
    const untar = spawnSync('tar', ['-xzf', archive, '-C', toolsDir], { stdio: 'inherit' });
    rmSync(archive, { force: true });
    if (untar.status !== 0) throw new Error('could not unpack the download');
  } else {
    writeFileSync(`${dest}.part`, body);
    renameSync(`${dest}.part`, dest);
  }
  if (!isWindows) chmodSync(dest, 0o755);
}

async function findCloudflared() {
  if (process.env.CLOUDFLARED) return process.env.CLOUDFLARED;
  const local = join(toolsDir, isWindows ? 'cloudflared.exe' : 'cloudflared');
  const candidates = [
    'cloudflared',
    local,
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  const found = candidates.find((c) => (c === 'cloudflared' || existsSync(c)) && works(c));
  if (found) return found;
  try {
    await download(local);
    if (works(local)) return local;
  } catch (error) {
    console.error(`Could not download cloudflared: ${error instanceof Error ? error.message : String(error)}`);
  }
  return null;
}

/** Starts the quick tunnel and resolves with its public address (cloudflared prints it on stderr). */
function startTunnel(bin) {
  return new Promise((resolveUrl, reject) => {
    const args = ['tunnel', '--no-autoupdate', '--url', target];
    if (tls) args.push('--no-tls-verify');
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let output = '';
    const timer = setTimeout(() => {
      reject(new Error(`no tunnel address after 60 s. cloudflared said:\n${output.slice(-1500)}`));
    }, 60_000);
    const onData = (chunk) => {
      output += chunk.toString();
      const match = TUNNEL_URL.exec(output);
      if (match) {
        clearTimeout(timer);
        resolveUrl(match[0]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      const hint = output.includes('failed to request quick Tunnel')
        ? '\nNo connection to Cloudflare: please check the internet connection (a firewall may block it).'
        : '';
      if (!stopping) reject(new Error(`cloudflared stopped (exit code ${code}).\n${output.slice(-1500)}${hint}`));
    });
  });
}

async function reachable(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until && !stopping) {
    try {
      const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return true;
    } catch {
      // DNS for a new quick tunnel takes a few seconds
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function openBrowser(url) {
  const opener = isWindows ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = isWindows ? ['/c', 'start', '', url] : [url];
  // No browser (or no opener): the address is printed anyway.
  const child = spawn(opener, args, { stdio: 'ignore', detached: true });
  child.on('error', () => undefined);
  child.unref();
}

const serverEntry = join(root, 'apps/server/dist/index.js');
if (!existsSync(serverEntry)) {
  console.error('Pulse is not built yet. Run Start-Pulse once (or `pnpm setup:local`).');
  process.exit(1);
}

const bin = await findCloudflared();
if (!bin) {
  fail(
    [
      'cloudflared is needed for the online address. Install it once, then start again:',
      '  Mac:     brew install cloudflared',
      '  Windows: winget install --id Cloudflare.cloudflared',
      'Or download it from https://github.com/cloudflare/cloudflared/releases',
    ].join('\n'),
  );
} else {
  console.log('Starting the tunnel …');
  let publicUrl;
  try {
    publicUrl = await startTunnel(bin);
  } catch (error) {
    fail(`The tunnel did not start: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (publicUrl) {
    console.log(`Tunnel address: ${publicUrl}\nStarting Pulse …`);
    const server = spawn(process.execPath, [serverEntry], {
      cwd: root,
      env: { ...process.env, PUBLIC_BASE_URL: publicUrl },
      stdio: 'inherit',
    });
    children.push(server);
    server.on('exit', (code) => {
      if (!stopping) fail(`Pulse stopped (exit code ${code}). Scroll up for the error message.`);
    });
    const ok = await reachable(publicUrl, 60_000);
    if (!stopping) {
      const line = '='.repeat(64);
      console.log(`\n${line}`);
      console.log(ok ? '  Pulse is online.' : '  Pulse is running; the address does not answer yet (try in a minute).');
      console.log(`  Phones join at:   ${publicUrl}`);
      console.log(`  On this computer: ${adminUrl}`);
      console.log('  The slides show this address by themselves. Keep this window open while presenting.');
      console.log(`${line}\n`);
      openBrowser(adminUrl);
    }
  }
}
