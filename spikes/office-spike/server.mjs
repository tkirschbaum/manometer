#!/usr/bin/env node
// Phase 0 Office spike server. Throwaway. Node >= 22, no dependencies.
//
//   node server.mjs           HTTPS on https://localhost:3443 using office-addin-dev-certs
//   node server.mjs --http    plain HTTP on http://localhost:3080 (only behind a cloudflared quick tunnel)
//
// Serves public/ and collects log entries from every spike instance (POST /log), so
// that instances you cannot see (presenter view, next-slide preview, other slides)
// still report what they observed. Binds to loopback only.
//
//   /logs         live log viewer with markers
//   /report.md    per-instance summary + condensed timeline (paste this back)
//   /logs.ndjson  raw log
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const useHttp = process.argv.includes('--http');
const PORT = Number(process.env.PORT ?? (useHttp ? 3080 : 3443));
const PUBLIC_DIR = join(here, 'public');
const LOG_DIR = join(here, 'logs');
const MAX_BODY = 512 * 1024;
const MAX_ENTRIES = 50_000;

mkdirSync(LOG_DIR, { recursive: true });
const startedAt = new Date();
const logFile = join(LOG_DIR, `spike-${startedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.ndjson`);

/** @type {Array<Record<string, unknown>>} */
let entries = [];
let seq = 0;

function addEntry(entry) {
  seq += 1;
  const stored = { seq, rt: new Date().toISOString(), ...entry };
  entries.push(stored);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  appendFileSync(logFile, `${JSON.stringify(stored)}\n`);
  return stored;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(res, status, type, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

const json = (res, status, value) => send(res, status, TYPES['.json'], JSON.stringify(value));

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sanitiseClientEntry(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const kind = typeof raw.kind === 'string' ? raw.kind.slice(0, 80) : null;
  if (!kind) return null;
  return {
    src: 'client',
    nonce: typeof raw.nonce === 'string' ? raw.nonce.slice(0, 40) : 'unknown',
    cseq: Number.isFinite(raw.seq) ? raw.seq : null,
    ct: typeof raw.t === 'string' ? raw.t.slice(0, 40) : null,
    ms: Number.isFinite(raw.ms) ? Math.round(raw.ms) : null,
    kind,
    data: raw.data ?? null,
  };
}

async function postLog(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 413, { ok: false });
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json(res, 400, { ok: false });
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  let accepted = 0;
  for (const raw of list.slice(0, 2000)) {
    const entry = sanitiseClientEntry(raw);
    if (entry) {
      addEntry(entry);
      accepted += 1;
    }
  }
  return json(res, 200, { ok: true, accepted });
}

async function postMarker(req, res) {
  let text = '';
  try {
    const parsed = JSON.parse(await readBody(req));
    text = typeof parsed.text === 'string' ? parsed.text.slice(0, 200) : '';
  } catch {
    return json(res, 400, { ok: false });
  }
  if (!text) return json(res, 400, { ok: false });
  const stored = addEntry({ src: 'viewer', nonce: 'marker', kind: 'marker', data: { text } });
  return json(res, 200, { ok: true, seq: stored.seq });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const full = resolve(PUBLIC_DIR, `.${normalize(rel)}`);
  if (!full.startsWith(PUBLIC_DIR + sep) || !existsSync(full) || !statSync(full).isFile()) {
    return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  }
  const type = TYPES[extname(full)] ?? 'application/octet-stream';
  const headers = pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {};
  return send(res, 200, type, req.method === 'HEAD' ? undefined : readFileSync(full), headers);
}

// ---------------------------------------------------------------------------
// Report

const short = (value, max = 240) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const NOISY = new Set(['poll.error.repeat']);

function buildReport() {
  const lines = [];
  const byNonce = new Map();
  for (const e of entries) {
    if (e.src !== 'client') continue;
    if (!byNonce.has(e.nonce)) byNonce.set(e.nonce, []);
    byNonce.get(e.nonce).push(e);
  }
  lines.push('# Pulse Office spike report');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} · server started ${startedAt.toISOString()} · ${entries.length} entries · ${byNonce.size} instances`);
  lines.push('');
  lines.push('## Instances');
  lines.push('');
  lines.push('| instance | platform | version | lang | first view | views seen | bound slide | slides seen | first rt | last rt |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const [nonce, list] of byNonce) {
    const env = list.find((e) => e.kind === 'office.ready')?.data ?? {};
    const views = [...new Set(list.filter((e) => e.kind === 'view').map((e) => e.data?.view))].join(' → ');
    const slides = [...new Set(list.filter((e) => e.kind === 'slide').map((e) => (e.data?.ids ?? []).join('+')))].join(', ');
    const boundEntry = [...list].reverse().find((e) => e.data && 'bound' in e.data);
    lines.push(
      `| ${nonce.slice(0, 8)} | ${env.platform ?? '?'} | ${env.version ?? '?'} | ${env.displayLanguage ?? '?'} | ${list.find((e) => e.kind === 'view')?.data?.view ?? '?'} | ${views || '?'} | ${boundEntry?.data?.bound ?? '–'} | ${slides || '–'} | ${list[0].rt.slice(11, 23)} | ${list[list.length - 1].rt.slice(11, 23)} |`,
    );
  }
  for (const [nonce, list] of byNonce) {
    lines.push('');
    lines.push(`### Instance ${nonce.slice(0, 8)}`);
    lines.push('');
    const env = list.find((e) => e.kind === 'env');
    if (env) lines.push(`- env: \`${short(env.data, 900)}\``);
    const ready = list.find((e) => e.kind === 'office.ready');
    if (ready) lines.push(`- office.ready: \`${short(ready.data, 900)}\``);
    const probes = new Map();
    for (const e of list) if (e.kind.startsWith('probe.')) probes.set(e.kind, e.data);
    if (probes.size > 0) {
      lines.push('- probes (last result each):');
      for (const [kind, data] of probes) lines.push(`  - ${kind}: \`${short(data, 600)}\``);
    }
    const counts = {};
    for (const e of list) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    lines.push(`- entry counts: \`${short(counts, 900)}\``);
  }
  lines.push('');
  lines.push('## Timeline (condensed)');
  lines.push('');
  lines.push('```');
  const timeline = entries.filter((e) => !NOISY.has(e.kind)).slice(-3000);
  for (const e of timeline) {
    const who = e.src === 'client' ? e.nonce.slice(0, 8) : `--${e.src}--`;
    lines.push(`${e.rt.slice(11, 23)} ${who.padEnd(10)} ${e.kind.padEnd(24)} ${short(e.data, 260)}`);
  }
  lines.push('```');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Log viewer (static HTML, data via /logs.json)

const VIEWER = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spike logs</title>
<style>
  body{font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;margin:0;background:#fff;color:#1a1f2b}
  header{position:sticky;top:0;background:#eef1f5;border-bottom:1px solid #d5dbe3;padding:8px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  input{font:inherit;padding:4px 6px;border:1px solid #9aa5b5;border-radius:4px}
  button{font:inherit;padding:4px 10px;border:1px solid #1b2a4a;background:#1b2a4a;color:#fff;border-radius:4px;cursor:pointer}
  button.secondary{background:#fff;color:#1b2a4a}
  a{color:#1b2a4a}
  table{border-collapse:collapse;width:100%}
  td{padding:2px 8px;border-bottom:1px solid #eef1f5;vertical-align:top;white-space:pre-wrap;word-break:break-word}
  td.t{white-space:nowrap;color:#5b6573}
  td.n{white-space:nowrap;font-weight:600}
  tr.marker td{background:#1b2a4a;color:#fff}
</style></head>
<body>
<header>
  <strong>Spike logs</strong>
  <input id="filter" placeholder="filter (kind, instance, text)" size="28">
  <input id="marker" placeholder="marker, e.g. W-7.1 start" size="28">
  <button id="add">Add marker</button>
  <button id="clear" class="secondary">Clear view</button>
  <a href="/report.md" target="_blank">report.md</a>
  <a href="/logs.ndjson">logs.ndjson</a>
  <span id="count"></span>
</header>
<table><tbody id="rows"></tbody></table>
<script>
  const rows = document.getElementById('rows');
  const filter = document.getElementById('filter');
  let since = 0; let all = [];
  const colour = (n) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return 'hsl(' + h + ' 55% 32%)'; };
  function render() {
    const f = filter.value.trim().toLowerCase();
    rows.textContent = '';
    const list = all.filter((e) => !f || JSON.stringify(e).toLowerCase().includes(f)).slice(-1500).reverse();
    for (const e of list) {
      const tr = document.createElement('tr');
      if (e.kind === 'marker') tr.className = 'marker';
      const cells = [e.rt.slice(11, 23), e.src === 'client' ? e.nonce.slice(0, 8) : e.src, e.kind, JSON.stringify(e.data)];
      cells.forEach((text, i) => {
        const td = document.createElement('td');
        td.className = ['t', 'n', '', ''][i];
        td.textContent = text;
        if (i === 1 && e.src === 'client') td.style.color = colour(e.nonce);
        tr.appendChild(td);
      });
      rows.appendChild(tr);
    }
    document.getElementById('count').textContent = all.length + ' entries';
  }
  async function poll() {
    try {
      const res = await fetch('/logs.json?since=' + since);
      const data = await res.json();
      if (data.entries.length) { all = all.concat(data.entries); since = data.entries[data.entries.length - 1].seq; render(); }
    } catch (e) { /* server restarting */ }
  }
  document.getElementById('add').onclick = async () => {
    const input = document.getElementById('marker');
    if (!input.value.trim()) return;
    await fetch('/logs/marker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: input.value.trim() }) });
    input.value = ''; poll();
  };
  document.getElementById('clear').onclick = () => { all = []; render(); };
  filter.oninput = render;
  poll(); setInterval(poll, 1500);
</script>
</body></html>`;

// ---------------------------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'https://localhost');
  const { pathname } = url;
  try {
    if (req.method === 'POST' && pathname === '/log') return await postLog(req, res);
    if (req.method === 'POST' && pathname === '/logs/marker') return await postMarker(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed');
    if (pathname === '/ping') return json(res, 200, { ok: true, t: Date.now() });
    if (pathname === '/logs') return send(res, 200, TYPES['.html'], VIEWER);
    if (pathname === '/logs.json') {
      const since = Number(url.searchParams.get('since') ?? 0);
      return json(res, 200, { entries: entries.filter((e) => e.seq > since).slice(0, 5000) });
    }
    if (pathname === '/logs.ndjson') {
      return send(res, 200, 'application/x-ndjson; charset=utf-8', entries.map((e) => JSON.stringify(e)).join('\n'), {
        'Content-Disposition': 'attachment; filename="spike-logs.ndjson"',
      });
    }
    if (pathname === '/report.md') return send(res, 200, 'text/plain; charset=utf-8', buildReport());
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    return send(res, 500, 'text/plain; charset=utf-8', 'Internal error');
  }
}

function loadDevCerts() {
  const dir = join(homedir(), '.office-addin-dev-certs');
  const cert = join(dir, 'localhost.crt');
  const key = join(dir, 'localhost.key');
  if (!existsSync(cert) || !existsSync(key)) {
    console.error(`Dev certificates not found in ${dir}.`);
    console.error('Run once:  npx office-addin-dev-certs install');
    console.error('(or start with --http behind a cloudflared quick tunnel, see README.md)');
    process.exit(1);
  }
  return { cert: readFileSync(cert), key: readFileSync(key) };
}

const tls = useHttp ? null : loadDevCerts();
const makeServer = () => (tls ? createHttpsServer(tls, handle) : createHttpServer(handle));

// Office may resolve "localhost" to 127.0.0.1 or ::1, so listen on both loopback addresses.
for (const host of ['127.0.0.1', '::1']) {
  const server = makeServer();
  server.on('error', (error) => {
    if (host === '::1') console.warn(`IPv6 loopback not available (${error.code}); continuing on 127.0.0.1 only.`);
    else {
      console.error(error);
      process.exit(1);
    }
  });
  server.listen(PORT, host);
}

const scheme = useHttp ? 'http' : 'https';
console.log(`Spike server on ${scheme}://localhost:${PORT}`);
console.log(`  add-in page   ${scheme}://localhost:${PORT}/index.html`);
console.log(`  log viewer    ${scheme}://localhost:${PORT}/logs`);
console.log(`  report        ${scheme}://localhost:${PORT}/report.md`);
console.log(`  log file      ${logFile}`);
addEntry({ src: 'server', nonce: 'server', kind: 'server.start', data: { port: PORT, scheme } });
