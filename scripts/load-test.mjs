// Load test (master prompt §15): 250 participants join one deck within 20 s; scenarios multiple choice,
// word cloud (3 entries each) and quiz (everyone answers within the window).
// Pass: 0 lost responses, p95 submit-ack < 300 ms, presenter receives ≤ 4 updates/s, server RSS < 300 MB.
//
//   pnpm build && pnpm test:load                 (embedded database)
//   DATABASE_URL=postgres://… pnpm test:load     (PostgreSQL, as in production)
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const PARTICIPANTS = Number(process.env.LOAD_PARTICIPANTS ?? 250);
const JOIN_WINDOW_MS = 20_000;
const PORT = Number(process.env.LOAD_PORT ?? 3998);
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['apps/server/dist/index.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    APP_DOMAIN: `localhost:${PORT}`,
    PUBLIC_BASE_URL: BASE,
    EXPORT_TOKEN_SECRET: 'load-test-export-secret-load-test-export',
    PARTICIPANT_HASH_SALT: 'load-test-participant-salt',
    PGLITE_DIR: process.env.DATABASE_URL ? '.data/unused' : 'memory://',
    LOG_LEVEL: 'warn',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const fail = (msg) => {
  console.error(msg);
  server.kill('SIGKILL');
  process.exit(1);
};
const watchdog = setTimeout(() => fail('load test timed out'), 6 * 60_000);

for (let i = 0; ; i++) {
  if (await fetch(`${BASE}/healthz`).then((r) => r.ok).catch(() => false)) break;
  if (i > 120) fail('server did not start');
  await sleep(250);
}

let peakRss = 0;
const rssSampler = setInterval(() => {
  try {
    const status = readFileSync(`/proc/${server.pid}/status`, 'utf8');
    const kb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
    peakRss = Math.max(peakRss, kb / 1024);
  } catch {
    // not Linux: RSS not sampled
  }
}, 250);

const ack = (socket, event, payload, timeout = 10_000) =>
  new Promise((resolve) => {
    const started = performance.now();
    socket.timeout(timeout).emit(event, payload, (err, res) => {
      resolve({ ms: performance.now() - started, ok: !err && res?.ok === true, res, err });
    });
  });

// -- presenter --------------------------------------------------------------------------------
const deckId = randomUUID();
const deckSecret = randomBytes(32).toString('base64url');
const presenter = io(`${BASE}/presenter`, { auth: { deckId, deckSecret }, transports: ['websocket'] });
const deckState = await new Promise((resolve) => presenter.once('deck:state', resolve));
const updates = new Map(); // itemId -> timestamps
const lastResults = new Map();
presenter.on('results:update', (r) => {
  if (!updates.has(r.itemId)) updates.set(r.itemId, []);
  updates.get(r.itemId).push(Date.now());
  lastResults.set(r.itemId, r);
});

// -- participants join within 20 s ------------------------------------------------------------
console.log(`joining ${PARTICIPANTS} participants within ${JOIN_WINDOW_MS / 1000} s …`);
const joinStarted = Date.now();
const participants = await Promise.all(
  Array.from({ length: PARTICIPANTS }, (_, i) =>
    (async () => {
      await sleep((i / PARTICIPANTS) * JOIN_WINDOW_MS);
      const socket = io(`${BASE}/participant`, {
        auth: { joinCode: deckState.joinCode, participantId: randomUUID() },
        transports: ['websocket'],
        reconnection: true,
      });
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    })(),
  ),
);
const joinSeconds = (Date.now() - joinStarted) / 1000;
console.log(`all joined in ${joinSeconds.toFixed(1)} s`);

const base = { deckId, schemaVersion: 1, kind: 'question', resultsVisibility: 'live', showOnPhone: false };
const results = [];

function maxPerSecond(times) {
  let max = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i] - times[j] >= 1000) j++;
    max = Math.max(max, i - j + 1);
  }
  return max;
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

async function scenario(name, config, perParticipant, expected) {
  const activated = await ack(presenter, 'item:activate', { itemId: config.id, config });
  if (!activated.ok) fail(`${name}: activation failed`);
  if (config.type === 'quiz') await sleep(3200); // countdown
  const latencies = [];
  let failed = 0;
  const windowMs = config.type === 'quiz' ? 15_000 : 10_000;
  await Promise.all(
    participants.map(async (socket, i) => {
      await sleep(Math.random() * windowMs);
      for (const payload of perParticipant(i)) {
        const r = await ack(socket, 'response:submit', { itemId: config.id, clientResponseId: randomUUID(), payload });
        latencies.push(r.ms);
        if (!r.ok) failed++;
      }
    }),
  );
  await sleep(config.type === 'quiz' ? 8000 : 1500);
  const final = lastResults.get(config.id);
  const stored = final?.responses ?? 0;
  const row = {
    scenario: name,
    submissions: latencies.length,
    failed,
    stored,
    lost: expected - stored,
    p95AckMs: Math.round(p95(latencies)),
    maxAckMs: Math.round(Math.max(...latencies)),
    maxPresenterUpdatesPerSecond: maxPerSecond(updates.get(config.id) ?? []),
  };
  results.push(row);
  console.log(row);
}

await scenario(
  'multiple_choice',
  { ...base, id: randomUUID(), type: 'multiple_choice', prompt: 'Load MC', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }], allowMultiple: false },
  (i) => [{ type: 'multiple_choice', optionIds: [['a', 'b', 'c', 'd'][i % 4]] }],
  PARTICIPANTS,
);

const vocabulary = ['Herz', 'Lunge', 'Niere', 'Leber', 'Milz', 'Gehirn', 'Muskel', 'Knochen', 'Blut', 'Haut', 'Darm', 'Magen'];
await scenario(
  'word_cloud',
  { ...base, id: randomUUID(), type: 'word_cloud', prompt: 'Load WC', entriesPerParticipant: 3 },
  (i) => [0, 1, 2].map((k) => ({ type: 'word_cloud', text: vocabulary[(i + k * 5) % vocabulary.length] })),
  PARTICIPANTS * 3,
);

// Quiz needs a nickname per participant first.
await Promise.all(participants.map((socket, i) => ack(socket, 'nickname:set', { nickname: `Spieler ${i + 1}` })));
await scenario(
  'quiz',
  { ...base, id: randomUUID(), type: 'quiz', prompt: 'Load quiz', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }], correctOptionId: 'b', timeLimitSec: 20, startMode: 'auto' },
  (i) => [{ type: 'quiz', optionId: ['a', 'b', 'c', 'd'][i % 4] }],
  PARTICIPANTS,
);

clearInterval(rssSampler);
clearTimeout(watchdog);
for (const s of participants) s.close();
presenter.close();
server.kill('SIGTERM');

const pass = results.every((r) => r.lost === 0 && r.failed === 0 && r.p95AckMs < 300 && r.maxPresenterUpdatesPerSecond <= 4) && (peakRss === 0 || peakRss < 300);
console.log('\nsummary');
console.table(results);
console.log(`participants: ${PARTICIPANTS}, joined in ${joinSeconds.toFixed(1)} s, peak server RSS: ${peakRss ? `${peakRss.toFixed(0)} MB` : 'n/a'}, database: ${process.env.DATABASE_URL ? 'postgres' : 'pglite'}`);
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
