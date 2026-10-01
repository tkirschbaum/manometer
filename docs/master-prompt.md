# MASTER PROMPT — Live Audience Voting for PowerPoint (Mentimeter-class, internal)

> Executor: Claude Code. Author/owner: Tobias (TK Webwerk), IT apprentice at Karl Landsteiner Privatuniversität (klu), Krems.
> This document is the single source of truth. Zero creative latitude on architecture, data model, contracts, and behaviour. Where a decision is explicitly marked **[VERIFY]**, you must verify it empirically in Phase 0 and record the result before building on it. Where something is marked **[PLACEHOLDER]**, use the stated default and keep it trivially replaceable via config.

---

## 0. Mission

Build an internal, self-hosted live-voting system that works like Mentimeter, but lives **inside PowerPoint**:

1. A **PowerPoint content add-in** (one add-in, inserted onto slides). Each inserted instance = one interactive slide (a question, a leaderboard, or a Q&A wall).
   - In **edit mode** the instance shows an editor to configure the question.
   - In **slideshow mode** it shows the join instructions (URL + code + QR) and live results.
2. A **participant web app** (mobile-first, no install, no account). Audience scans the QR or types the code and answers.
3. A **server** (single Node process) holding the realtime layer, API, and PostgreSQL persistence.

Presenters never create an account and never log in. Installing the add-in is the only setup. All presenter-side state lives **inside the .pptx file** (Office add-in settings), plus a high-entropy deck secret that authorises presenter actions on the server.

Scope: internal use at klu, testing phase first. Max **250 concurrent participants per session**. Platforms: **PowerPoint for Windows (Microsoft 365 Apps) and PowerPoint for Mac**. PowerPoint on the web is explicitly out of scope (see §6.6 for why).

Working title: **Pulse** **[PLACEHOLDER]** — every user-facing occurrence must come from a single config constant `PRODUCT_NAME`.
Public domain: **`{{APP_DOMAIN}}`** (e.g. `pulse.example.at`) **[PLACEHOLDER]** — single env var `APP_DOMAIN`.

---

## 1. Non-negotiable principles

1. **The .pptx is the source of truth for question content.** The server mirrors it. A deck opened on a different PC (e.g. the lecture hall PC) must work without any prior sync, because the add-in pushes full question config to the server on activation.
2. **No accounts, no login, no tracking.** Presenter authority = possession of the deck secret stored in the file. Participant identity = random UUID in the participant's browser.
3. **One origin.** Participant app, add-in, API and WebSocket all served from `https://{{APP_DOMAIN}}`. No CORS setup needed, no third-party runtime services.
4. **Never show a broken slide.** If the server is unreachable during a slideshow, the slide still shows join URL, code and QR (rendered from data stored in the file) plus a calm reconnect indicator. Never a blank frame, never a stack trace.
5. **University NAT awareness.** All students on eduroam share very few public IPs. Never rate-limit or deduplicate per IP alone. Deduplicate per participant UUID; IP limits only as a generous abuse ceiling (see §9).
6. **Mobile-first participant UI**, desktop second. Tap targets ≥ 48 px. Works on a 5-year-old Android phone on bad Wi-Fi.
7. **TypeScript strict everywhere.** Shared contracts (zod) between server, add-in and participant app. No `any`, no unchecked JSON.
8. **No generic AI aesthetic.** Follow §11 exactly.
9. **Do not proceed to the next phase until the current phase's acceptance criteria pass.** After each phase, write a short report to `docs/progress.md` (what was built, what was verified, deviations, open issues).

---

## 2. Tech stack (fixed)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces | Node 22 LTS |
| Server | Fastify 5 + Socket.IO 4 | One process, one port. Socket.IO chosen over raw `ws` for rooms, acks, auto-reconnect and HTTP long-polling fallback (campus proxies/captive Wi-Fi). |
| DB | PostgreSQL 16 + Drizzle ORM + drizzle-kit migrations | |
| Validation | zod (shared package) | Every socket event and HTTP body validated on the server. |
| Add-in UI | Vite + React 19 + TypeScript + Tailwind CSS 4 | Static SPA served under `/addin/`. **Not Next.js** — Office.js and framework routers conflict (history API), and SSR has no value here. |
| Participant UI | Vite + React 19 + TypeScript + Tailwind CSS 4 | Static SPA served under `/`. |
| Office integration | Office.js from `https://appsforoffice.microsoft.com/lib/1/hosted/office.js`, **XML add-in-only manifest**, type `ContentApp`, host `Presentation` | Common API only (`Office.context.document.*`). Do **not** depend on the `PowerPoint.run` application-specific API inside the content add-in unless Phase 0 proves it works there on both Win and Mac. |
| Charts | Hand-rolled SVG for bars/scales (no chart library), `d3-cloud` for word cloud layout | Full control over typography and animation. |
| QR | `qrcode` (SVG output) | |
| i18n | Tiny in-house dictionary in shared package (`de`, `en`) | No i18n framework. |
| Export | CSV (built-in) + XLSX via `exceljs` | |
| Reverse proxy / TLS | Caddy 2 (automatic HTTPS) | |
| Deployment | Docker Compose: `caddy`, `server`, `postgres` | Target for testing: small EU VPS (e.g. Hetzner Cloud, DE). Must run unchanged on a university VM later. |
| Tests | Vitest (unit), Playwright (participant e2e), Artillery with Socket.IO engine **or** a custom Node script using `socket.io-client` (load test, 250 clients) | |
| Lint/format | ESLint (typescript-eslint strict), Prettier | |

Why not Supabase/Vercel: Supabase Realtime's free plan caps at 200 concurrent connections (Pro: 500) and Vercel functions cannot hold WebSockets. A single self-hosted Socket.IO process handles 250 clients trivially, has no vendor quotas, and can move to a uni server unchanged.

---

## 3. Repository layout

```
/
├─ apps/
│  ├─ server/            Fastify + Socket.IO + Drizzle; serves built SPAs in production
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ env.ts                (zod-validated env)
│  │  │  ├─ db/schema.ts, db/client.ts, db/migrations/
│  │  │  ├─ realtime/             (socket handlers, room logic, aggregators, throttling)
│  │  │  ├─ http/                 (REST routes: health, export, deck dashboard API)
│  │  │  ├─ domain/               (scoring, word normalisation, join-code generation, retention)
│  │  │  └─ jobs/retention.ts
│  │  └─ test/
│  ├─ addin/             Vite SPA for the PowerPoint content add-in (base: /addin/)
│  │  ├─ public/manifest.xml     (templated, see §6.2)
│  │  └─ src/
│  │     ├─ office/              (Office.js wrappers: settings, view detection, slide identity)
│  │     ├─ editor/              (edit-mode UI per slide type)
│  │     ├─ stage/               (slideshow-mode UI per slide type)
│  │     └─ main.tsx
│  └─ participant/       Vite SPA for the audience (base: /)
│     └─ src/
├─ packages/
│  └─ shared/            zod schemas, TS types, socket event contracts, i18n dictionaries, design tokens, constants
├─ infra/
│  ├─ docker-compose.yml
│  ├─ docker-compose.dev.yml
│  ├─ Caddyfile
│  └─ Dockerfile.server        (multi-stage: builds shared + both SPAs + server)
├─ docs/
│  ├─ progress.md
│  ├─ phase0-findings.md
│  ├─ sideloading.md
│  ├─ deployment.md
│  └─ presenter-guide.de.md    (1-page guide for lecturers, German)
└─ CLAUDE.md                   (project conventions, generated in Phase 1 from this prompt)
```

---

## 4. Domain model

### 4.1 Concepts

- **Deck** — one PowerPoint presentation's live session. Has a permanent 6-digit **join code** (e.g. `482 913`) and a 256-bit **deck secret**. Participants join a deck, not a single question; they stay connected while the presenter moves through slides.
- **Slide item** — one inserted add-in instance. Kinds: `question` (6 question types), `leaderboard`, `qa_wall`.
- **Active item** — at most one per deck. The participant app always shows what the active item demands (answer UI, quiz phase, or a waiting screen).
- **Participant** — anonymous, UUID v4 generated in the browser, persisted in `localStorage` with a cookie fallback (`pulse_pid`, SameSite=Lax, 180 days) for browsers that wipe storage.

### 4.2 Question types (all in scope)

| Type key | Name (DE / EN) | Participant input | Stage visual |
|---|---|---|---|
| `multiple_choice` | Mehrfachauswahl / Multiple choice | Pick 1 option (or up to N if `allowMultiple`) from 2–8 options | Horizontal bars with count + % |
| `word_cloud` | Wortwolke / Word cloud | 1–3 short entries (config `entriesPerParticipant`, default 3), max 25 chars each | Word cloud, weight = frequency |
| `open_text` | Offene Frage / Open question | Free text, max 280 chars, up to `entriesPerParticipant` (default 1, max 5) | Masonry wall of response cards, newest first |
| `scale` | Skala / Scale | Rate 1–3 statements on a 1–5 or 1–10 scale with optional end labels | Per statement: average marker + distribution strip |
| `quiz` | Quiz | Pick 1 option within a time limit | Countdown → distribution → correct answer reveal |
| `qa` (deck feature) | Fragen ans Publikum / Audience Q&A | Submit questions anytime (max 280 chars), upvote others | `qa_wall` slide: top questions sorted by votes |

Non-question kinds:
- `leaderboard` — shows quiz top 10 for the deck (cumulative over all quiz questions so far).
- `qa_wall` — shows the Q&A list; also acts as an "active item" so participants see the Q&A tab foregrounded.

Moderation: **no pre-approval queue, no word filter.** The presenter can hide individual responses (open text, word-cloud entries, Q&A items) from the stage in edit mode and in slideshow (small hide button on hover). Hidden items are kept in exports with `hidden=true`.

### 4.3 Shared zod schemas (packages/shared)

Define a discriminated union `SlideItemConfig` on `kind` and, for questions, `type`. Minimum fields:

```ts
// Common
id: string (uuid v4, generated by the add-in)
kind: 'question' | 'leaderboard' | 'qa_wall'
deckId: string (uuid)
schemaVersion: 1

// question common
type: 'multiple_choice' | 'word_cloud' | 'open_text' | 'scale' | 'quiz'
prompt: string (1..200 chars)
resultsVisibility: 'live' | 'on_reveal'   // default 'live'; quiz forces its own flow
showOnPhone: boolean                      // participant sees results after answering; default false (quiz: always true for own result)

// multiple_choice
options: { id: string; label: string (1..80) }[]  (2..8)
allowMultiple: boolean (default false), maxSelections?: number (2..options.length)
correctOptionIds?: string[]  // optional "mark correct" for non-quiz MC

// word_cloud
entriesPerParticipant: 1|2|3 (default 3)

// open_text
entriesPerParticipant: 1..5 (default 1)

// scale
statements: { id: string; label: string (1..120) }[] (1..3)
range: 5 | 10 (default 5)
minLabel?: string (≤30), maxLabel?: string (≤30)

// quiz
options: { id; label }[] (2..6), correctOptionId: string
timeLimitSec: 10|15|20|30|45|60 (default 20)
startMode: 'auto' | 'click' (default 'auto' = starts 3 s after the slide becomes active)
```

Deck-level settings (stored in every instance, see §6.3): `title`, `slideLanguage: 'de'|'en'`, `theme: 'light'|'dark'`, `qaEnabled: boolean`, `showQr: boolean` (default true).

---

## 5. Server

### 5.1 Database schema (Drizzle)

```
decks
  id uuid pk
  join_code char(6) unique not null            -- digits only, no leading-zero issues: store as text
  secret_hash text not null                    -- sha256(secret) hex; secret is 256-bit random so plain SHA-256 is adequate
  title text
  settings jsonb not null                      -- deck-level settings mirror
  active_item_id uuid null
  active_since timestamptz null
  created_at timestamptz default now()
  last_activity_at timestamptz default now()   -- drives retention

slide_items
  id uuid pk                                   -- from add-in
  deck_id uuid fk -> decks on delete cascade
  kind text, type text null
  config jsonb not null                        -- validated SlideItemConfig
  config_hash text not null                    -- sha256 of canonical JSON
  state text not null default 'idle'           -- idle | open | closed  (quiz: idle | countdown | answering | reveal)
  phase_ends_at timestamptz null               -- quiz timer, server-authoritative
  opened_at timestamptz null
  created_at, updated_at

participants
  id uuid pk                                   -- from browser
  deck_id uuid fk
  nickname text null                           -- quiz only, 2..20 chars
  created_at, last_seen_at
  unique(deck_id, id)

responses
  id bigserial pk
  client_response_id uuid unique not null      -- generated by participant app; makes retries idempotent
  item_id uuid fk -> slide_items on delete cascade
  participant_id uuid
  payload jsonb not null                       -- typed per question type
  points int null                              -- quiz
  response_ms int null                         -- quiz: ms since answering phase start
  hidden boolean default false
  created_at timestamptz default now()
  index(item_id)
  -- uniqueness enforced in domain logic per type (MC/scale/quiz: one per participant; word_cloud/open_text: up to N)

qa_items
  id uuid pk, deck_id fk, participant_id uuid, text text, upvotes int default 0,
  answered boolean default false, hidden boolean default false, created_at
qa_votes
  qa_item_id uuid fk, participant_id uuid, primary key (qa_item_id, participant_id)
```

**No IP addresses, user agents, or other identifiers are ever written to the database.**

### 5.2 Join codes
- 6 random digits, displayed as `482 913`. Reject codes with ≥ 4 identical digits or simple sequences. Retry on collision.
- Join code is permanent for the deck until retention deletes it.

### 5.3 Realtime contract (Socket.IO)

Two namespaces: `/presenter` and `/participant`. All payloads validated with zod; invalid payloads are acked with `{ ok: false, error: 'INVALID_PAYLOAD' }` and logged at `warn` without payload content.

**Presenter namespace** — handshake `auth: { deckId, deckSecret }`. Server verifies `sha256(deckSecret) === secret_hash`; on unknown `deckId` with a valid-format secret, the deck is **created on first connect** (this is how a brand-new deck comes to exist — no separate registration call). Deck creation is capped globally at 300/hour (abuse ceiling, not per IP). Joins room `deck:{id}:presenter`. Every successful connect returns the current `joinCode` in the first `deck:state` message; the add-in writes it back into its settings if it changed (e.g. after retention recreated the deck).

Events presenter → server (all with ack):
| Event | Payload | Effect |
|---|---|---|
| `deck:upsert` | deck settings + title | Upsert deck settings. Returns `{ joinCode }`. |
| `item:upsert` | full `SlideItemConfig` | Upsert item (debounced client-side 600 ms). Recompute `config_hash`. |
| `item:activate` | `{ itemId, config }` | Upsert config **and** make it the deck's active item. If item was `idle` → `open` (quiz → `countdown` if `startMode='auto'`). Emits state to participants. Idempotent. |
| `item:deactivate` | `{ itemId }` | Only clears active item if it is still the active one (no clobbering). |
| `item:reveal` | `{ itemId }` | For `on_reveal` results / quiz manual start. |
| `item:close` / `item:reopen` | `{ itemId }` | Stop/allow new responses. |
| `item:reset` | `{ itemId }` | Delete all responses for the item (confirmation dialog in UI). |
| `response:hide` / `qa:hide` / `qa:answered` | ids | Moderation. |
| `export:token` | `{}` | Returns a single-use, 5-minute signed token for the export/dashboard page (§5.6). |

Server → presenter: `results:update` (throttled, see §5.4), `participants:count` (debounced 1 s), `item:state` (state machine changes, quiz timers).

**Participant namespace** — handshake `auth: { joinCode, participantId }`. Joins `deck:{id}:audience` and `deck:{id}:p:{participantId}` (private room for personal quiz feedback).

Server → participant: `deck:state` on connect and on every active-item change: `{ deck: {title, slideLanguage, qaEnabled}, activeItem: null | PublicItemView, myResponseState }`. `PublicItemView` **must never contain** `correctOptionId(s)` before reveal.

Participant → server (ack): `response:submit`, `qa:submit`, `qa:upvote`, `qa:unvote`, `nickname:set`.

### 5.4 Aggregation and throttling
- Per active item, keep an in-memory aggregate (counts per option, word frequencies, scale histograms, response list). Rebuild from DB on server restart or on first access.
- Write each response to Postgres immediately (single insert; at 250 users this is trivial).
- Emit `results:update` to presenters **at most 4 ×/s** (trailing throttle, 250 ms). Word cloud: send top 80 normalised words only.
- Participants receive **no** live result stream unless `showOnPhone` (then max 1 ×/s).

### 5.5 Word normalisation (word_cloud)
- Trim, collapse inner whitespace, NFC normalise, strip leading/trailing punctuation.
- Grouping key: lowercase + German-aware folding is **not** applied (keep "Straße" ≠ "Strasse"); only case folding.
- Display form: the most frequent original casing in the group.
- Reject empty after normalisation; max 25 chars.

### 5.6 Quiz engine (server-authoritative)
State machine per quiz item: `idle → countdown (3 s) → answering (timeLimitSec) → reveal`. Timers live on the server (`phase_ends_at`); clients render from server timestamps with clock-offset correction (send `serverNow` in every state message).
- Scoring: correct answer → `points = round(1000 * (1 - (response_ms / (timeLimitSec*1000)) / 2))` → range 500–1000. Wrong or no answer → 0.
- Responses arriving after `phase_ends_at + 300 ms grace` are rejected with `TOO_LATE`.
- On reveal: each participant gets a private message `{ correct, points, totalPoints, rank, rankOf }`.
- Nickname required before the first quiz answer (participant app prompts once per deck). Nickname uniqueness per deck: append ` 2`, ` 3` on collision.
- `leaderboard` item: top 10 by total points across all quiz items of the deck; ties broken by lower cumulative response time.

### 5.7 HTTP routes
- `GET /healthz` → `{ ok: true, db: true }`.
- `GET /api/join/:code` → `{ exists: boolean }` (for the participant code-entry screen; 404 never leaks deck titles).
- `GET /dashboard?t=<token>` → serves a minimal presenter dashboard page (server-rendered HTML or small SPA route inside `participant` app, your choice; must be same design system) listing all items of the deck with response counts, buttons: **Export CSV**, **Export Excel**, **Reset item**, **Delete all deck data**.
- `GET /api/export/:deckId.(csv|xlsx)?t=<token>`.
  - CSV: UTF-8 **with BOM**, **semicolon** delimiter (German Excel default), CRLF line endings, ISO timestamps in Europe/Vienna.
  - Columns: `deck_title; slide_item_id; question_type; prompt; participant_ref; nickname; answer; points; response_ms; hidden; submitted_at`. `participant_ref` = first 8 chars of a salted hash of the participant id (not the raw UUID).
  - XLSX: one sheet per question plus a "Summary" sheet with aggregates.
- Tokens: HMAC-SHA256 signed (`EXPORT_TOKEN_SECRET` env), contain deckId + expiry, single use (store used-token jti in memory with TTL).

### 5.8 Retention
- Nightly job (03:30 Europe/Vienna, in-process cron via `node-cron` or a simple interval): delete decks with `last_activity_at < now() - RETENTION_DAYS` (env, default **90**). Cascade deletes everything.
- Add-in shows a notice when a deck was deleted server-side ("Ergebnisse dieser Präsentation wurden nach 90 Tagen gelöscht. Die Fragen bleiben in der Datei erhalten.") and silently recreates the deck on next connect (same deckId/secret, new join code).

---

## 6. PowerPoint content add-in

### 6.1 How it works for the presenter (target UX — must feel this simple)

1. *Einfügen → Add-ins → Pulse* → a frame appears on the current slide, sized to fill the slide.
2. First instance in a presentation: empty state with one primary action **"Neue Live-Session für diese Präsentation"**. Instances 2..n: the deck is offered automatically (see §6.4), presenter just picks the slide kind.
3. Pick a kind (6 question types, Leaderboard, Q&A wall) → inline editor → done. Changes save automatically (into the file and to the server).
4. Fastest workflow for many questions: **duplicate the slide** in PowerPoint and edit the copy. The add-in must detect the copy and turn it into a new, independent item automatically (§6.5).
5. Start the slideshow (F5). When a Pulse slide appears, it activates itself; audience phones switch to that question instantly. Moving on to a normal slide puts the phones into the waiting screen ("Warte auf die nächste Frage …"), so nobody keeps answering an old question (see §6.6).
6. Save the .pptx as usual. Everything needed lives in the file.

### 6.2 Manifest (XML, add-in only)

- `xsi:type="ContentApp"`, `<Hosts><Host Name="Presentation"/></Hosts>`.
- `<DefaultSettings><SourceLocation DefaultValue="https://{{APP_DOMAIN}}/addin/index.html"/><RequestedWidth>960</RequestedWidth><RequestedHeight>540</RequestedHeight></DefaultSettings>` — then **[VERIFY]** whether the frame can be programmatically/automatically sized to the full slide; if not, the empty state shows a one-line hint "Rahmen auf Foliengröße ziehen" with a small illustration, and the stage layout must look correct at any 16:9-ish frame size.
- `<Permissions>ReadWriteDocument</Permissions>`.
- `<AppDomains>` only `{{APP_DOMAIN}}`.
- Icons 32/64/80 px generated from the brand mark (§11).
- Generate `manifest.xml` from a template at build time with `APP_DOMAIN` substituted; also generate `manifest.dev.xml` pointing to `https://localhost:3443`.
- Validate with `npx office-addin-manifest validate`.

### 6.3 What is stored in the file (Office.Settings)

Office content add-in settings are stored in the document. **[VERIFY]** in Phase 0 that in PowerPoint (Win + Mac) settings are **per add-in instance** (each inserted frame has its own settings) and survive save/close/reopen and slide duplication (expected: copied with the slide).

Each instance stores exactly one key `pulse` with:
```ts
{
  v: 1,
  deck: { id, secret, joinCode, settings },      // duplicated into every instance on purpose
  item: SlideItemConfig,
  boundSlideId: string | null,                   // see §6.5
  lastSyncedHash: string | null
}
```
- Write with `Office.context.document.settings.set` + `saveAsync`, debounced 600 ms after the last edit.
- Show a quiet status line in the editor: "In Datei gespeichert · Mit Server synchronisiert" / "Offline – wird synchronisiert, sobald verbunden". Remind once per session: "Präsentation speichern (Strg+S), damit Änderungen in der Datei bleiben."
- **The deck secret never leaves the add-in except in the presenter socket handshake and is never rendered on screen.**

### 6.4 Linking new instances to the same deck

A freshly inserted instance has empty settings and cannot see sibling instances' settings. Strategy, in order:
1. **[VERIFY]** whether a document-level store is reachable from a content add-in on Win + Mac (e.g. `PowerPoint.run` → `presentation.tags`, or custom document properties). If yes: store `{deckId, secret}` there too, and new instances read it silently. This is the preferred path.
2. Fallback (must be implemented regardless, as the safety net): a device-local **deck registry** in `localStorage` (`pulse.decks` = list of `{deckId, secret, joinCode, title, lastUsedAt}`), written whenever any instance loads in edit mode. A new instance pre-selects the most recently used deck and shows: "Mit Live-Session »{title}« (Code {code}) verbinden" [primary] / "Andere Session wählen" / "Neue Session starten".
3. Duplicating a slide copies settings → already linked (§6.5).

Document in `docs/phase0-findings.md` which path works on each platform.

### 6.5 Slide identity and duplicate detection

Problem: a duplicated slide carries identical settings → two slides with the same `item.id`.
Approach:
- `boundSlideId` = PowerPoint slide id of the slide holding this instance. Obtain via `Office.context.document.getSelectedDataAsync(Office.CoercionType.SlideRange)` when the user interacts with the editor (the instance's slide is selected at that moment).
- On first editor interaction in edit mode: if `boundSlideId` is null → set it. If it differs from the currently selected slide id → this instance is a **copy**: generate a new `item.id`, keep deck credentials and the copied config, set new `boundSlideId`, save, and show a 3-second toast "Kopie erkannt – als neue Frage angelegt."
- **[VERIFY]** that slide ids from `SlideRange` are stable across save/reopen and differ for duplicated slides, on Win + Mac. If not reliable, fallback: a device-local "live instance" heartbeat in `localStorage` keyed by `item.id` with a per-runtime nonce; if two live instances with the same `item.id` and different nonces are seen, show a banner on the newer one: "Diese Frage existiert doppelt (Folie kopiert?)" with button "Als eigene Frage verwenden".

### 6.6 View detection and activation (slideshow)

- Use `Office.context.document.getActiveViewAsync` (`'edit' | 'read'`) at start and subscribe to `Office.EventType.ActiveViewChanged`. `edit` → render Editor. `read` → render Stage.
- PowerPoint on the web treats slideshow as a new session and does not fire `ActiveViewChanged`; that, plus inconsistent slideshow detection, is why the web is out of scope. If the add-in detects it runs in Office on the web (`Office.context.platform === Office.PlatformType.OfficeOnline`), show a clear notice in the editor: "PowerPoint im Web wird nicht unterstützt. Bitte die Desktop-App verwenden." Do not attempt workarounds.
- **Activation rule (Stage):** an instance in `read` view is "on screen" only if the current slideshow slide equals `boundSlideId`. Check via `getSelectedDataAsync(SlideRange)` immediately on entering `read`, on `DocumentSelectionChanged` if it fires in slideshow **[VERIFY]**, and by polling every 1000 ms as a fallback. When it becomes on-screen → emit `item:activate` with full config. When it stops being on-screen → emit `item:deactivate` (server ignores it if another item already took over).
- **[VERIFY]** behaviour in Presenter View (two monitors): instances may load twice (presenter screen + audience screen) and next-slide previews might load the next instance. The slide-id rule above must prevent premature activation; `item:activate` is idempotent so double instances of the current slide are harmless. Document findings.
- When the presenter socket for the active item disconnects, the server waits **10 s** grace, then sets the deck to waiting state (`activeItem = null`). Participants then see the waiting screen.
- On leaving slideshow (`read` → `edit`), active instances emit `item:deactivate`.

### 6.7 Stage UI (slideshow) — per kind

Common frame (all kinds), responsive to the frame size using container query units (`cqw/cqh`) so it scales with however large the frame is on the slide:
- **Join strip** (top or right edge, configurable later; default top): "{APP_DOMAIN} · Code **482 913**" in large type; QR code (if `showQr`) at the right, min 18 % of frame height. Must be legible from the back row of a lecture hall: at 1920×1080 the code renders ≥ 56 px.
- **Prompt** headline, max 2 lines, auto-shrink (clamp) before truncating.
- **Visualisation area.**
- **Footer:** response count with a person icon ("37 Antworten"), connection dot (only visible when not connected).
- Reconnecting state: everything static stays; visualisation shows last known data with 60 % opacity and a small "Verbindung wird hergestellt…" label.

Per type:
- `multiple_choice`: horizontal bars sorted in option order (not by votes, so bars don't jump), label left, count + % right. Bars animate width over 400 ms ease-out on update. `on_reveal`: bars hidden until reveal; show only count. If `correctOptionIds` and revealed: correct options get a check icon; others drop to 35 % opacity.
- `word_cloud`: d3-cloud, seeded layout for stability; re-layout at most once per 1.5 s; new words fade in; font sizes scaled by sqrt(frequency); max 80 words; colours only from the palette tokens (no rainbow).
- `open_text`: masonry wall of cards, newest top-left, max 24 visible, gentle auto-scroll of overflow every 6 s; text auto-sizes by length.
- `scale`: one row per statement: label, a horizontal track 1..N with tick marks, distribution as stacked dots/histogram above the track, average marker with value (one decimal, locale-formatted: "3,8" in DE).
- `quiz`: phases — *countdown* (big 3-2-1, the only playful animation in the product), *answering* (question + options with shapes ▲◆●■ for colour-independent identification + ring timer + answer count), *reveal* (distribution bars + correct option highlighted). `startMode='click'`: a large "Quiz starten" button on the stage (clickable during slideshow).
- `leaderboard`: top 10 nicknames with points; ranks 1–3 visually emphasised by size, not by gold/silver/bronze clip-art.
- `qa_wall`: top 8 questions by upvotes, each with vote count; answered ones collapse to the bottom with reduced opacity.
- Hide button (eye-slash icon) on hover for individual responses in `open_text`, `word_cloud` (per word group) and `qa_wall`.

### 6.8 Editor UI (edit mode)

- Lives inside the frame on the slide, so it must work from **480×270 px** upward. Compact, single column, scrolls internally.
- Top bar: kind/type selector (icon + label), live-session chip "Code 482 913" (click → copy join link), **Vorschau** toggle (renders the Stage with dummy data so the presenter sees the slideshow look while editing), overflow menu: *Ergebnisse zurücksetzen*, *Ergebnisse & Export öffnen* (→ `Office.context.ui.openBrowserWindow` with dashboard URL + one-time token; downloads don't work inside the add-in webview), *Session-Einstellungen* (title, slide language, theme, Q&A on/off, QR on/off), *Als neue Frage verwenden* (manual fork).
- Type-specific forms per §4.3 with inline validation, drag-to-reorder options (keyboard accessible: Alt+↑/↓).
- Never a modal for normal editing; confirmation dialog only for destructive actions (reset, delete).
- Add-in UI language follows `Office.context.displayLanguage` (`de*` → German, else English). Slide (Stage) language follows the deck setting `slideLanguage`.

### 6.9 Office.js integration rules

- Load Office.js via a plain `<script>` tag in `addin/index.html` **before** the app bundle.
- Office.js is known to null out `history.pushState/replaceState` in some hosts: cache both before Office.js loads and restore them after `Office.onReady`. The add-in uses no client router anyway (state-driven views), but restore them to keep libraries safe.
- Wrap every callback-based Office API in a typed Promise helper in `src/office/`. Never call Office APIs outside that folder.
- Provide a **browser dev harness**: when Office.js is not available (plain browser at `/addin/?harness=1`), swap `src/office/` for an in-memory mock (settings in memory, buttons to toggle edit/read view and simulate slide changes and duplicates). Phases 2–5 must be fully developable without PowerPoint.

---

## 7. Participant app

### 7.1 Routes
- `/` — code entry: one large numeric input (inputmode="numeric", auto-groups `482 913`), "Teilnehmen" button. Also accepts pasted links.
- `/{code}` — the session (QR target). Invalid code → inline error "Diesen Code gibt es nicht. Bitte prüfen." with input to retry.
- `/datenschutz` — privacy notice (§10), linked in the footer of every screen.

### 7.2 Screens / states inside a session
1. **Waiting:** deck title, "Warte auf die nächste Frage …", subtle breathing indicator (respects `prefers-reduced-motion`). If Q&A enabled: tab bar with *Live* | *Fragen*.
2. **Answering** per type, mirroring §4.2. Submit button disabled until valid. After submit: confirmation state "Antwort gesendet" with the submitted answer shown; for MC/scale/quiz no changing after submit; for word cloud/open text: "Noch eine Antwort senden" until the per-participant limit.
3. **Closed:** "Abstimmung beendet."
4. **Quiz:** nickname prompt on first quiz (once per deck, stored locally); countdown; answer grid with the same shapes/colours as the stage; after reveal: big "Richtig! +842" or "Leider falsch" + current rank "Platz 4 von 63".
5. **Q&A tab:** input (280 chars, live counter), list sorted by votes (toggle: *Beliebt* / *Neu*), upvote button with own-vote state; own questions marked "Deine Frage".
6. **Connection lost:** non-blocking top banner "Verbindung unterbrochen – wird wiederhergestellt"; inputs stay; pending submissions are queued and retried with the same client-generated response id (idempotent on server via `clientResponseId`).

### 7.3 Behaviour
- Language: `navigator.language` → `de` or `en`; manual toggle DE/EN in the footer, persisted locally.
- No cookies except the `pulse_pid` fallback (strictly necessary → no consent banner needed; state this in the privacy notice).
- Installable-ish: web app manifest + icons so "Zum Startbildschirm" looks right; no service worker caching of API data (a minimal SW only for the app shell is optional, skip if it complicates updates).
- Bundle budget: participant JS ≤ 120 kB gzipped initial; LCP < 1.5 s on simulated Fast 3G after first visit.

---

## 8. i18n

- Dictionaries in `packages/shared/i18n/{de,en}.ts`, typed so a missing key is a compile error.
- German is the reference language; write natural Austrian-neutral German (no "Klicke hier", no anglicisms where a plain German word exists). Use the same verb for an action through the whole flow ("Senden" → "Gesendet").
- Numbers and decimals via `Intl.NumberFormat` with the active locale ("3,8" / "3.8"); percentages without decimals.
- Gender-inclusive wording where unavoidable follows klu's own style (colon form, e.g. "Teilnehmer:innen"), but prefer neutral nouns ("Publikum", "alle").

---

## 9. Security & abuse handling

- Socket.IO `maxHttpBufferSize` 4 kB. All text inputs length-checked server-side.
- Per participant: max 10 submissions / 10 s, max 20 Q&A submissions / deck / hour, max 1 upvote per Q&A item.
- Per IP: only a generous ceiling (e.g. 600 new connections / minute) — campus NAT (§1.5).
- Render all user text as text (React default). **No `dangerouslySetInnerHTML` anywhere.** Lint rule enforcing it.
- Deck secret: 32 random bytes, base64url. Constant-time comparison of hashes.
- Security headers in Caddy: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a strict CSP for the participant app (`default-src 'self'; connect-src 'self' wss://{{APP_DOMAIN}}; img-src 'self' data:; style-src 'self' 'unsafe-inline'`). For `/addin/*` additionally allow `script-src https://appsforoffice.microsoft.com` and do **not** send `X-Frame-Options`/restrictive `frame-ancestors` (the add-in is hosted in an Office webview/iframe).
- Secrets only via env; ship `.env.example` with every variable documented.

Environment variables: `NODE_ENV`, `PORT`, `APP_DOMAIN`, `PUBLIC_BASE_URL` (override for tunnels in dev), `DATABASE_URL`, `EXPORT_TOKEN_SECRET`, `PARTICIPANT_HASH_SALT`, `RETENTION_DAYS=90`, `LOG_LEVEL=info`, `TZ=Europe/Vienna`.

---

## 10. Privacy (DSGVO)

- Stored: answers, random participant id, optional quiz nickname, timestamps. Not stored in the app: IP addresses, device data, names, e-mail.
- Caddy access logs: disabled in production (or IP-anonymised if logging is needed for debugging; document the choice).
- Server application logs: never log answer content, nicknames, secrets or tokens.
- Retention: 90 days after last deck activity (§5.8), plus presenter-triggered deletion in the dashboard.
- Hosting: EU only.
- `/datenschutz` page in DE/EN as a **draft**, with placeholders for controller and contact `[PLACEHOLDER]`, clearly covering the points above. Add a visible note in `docs/deployment.md`: the notice must be reviewed by klu's data protection officer before real classroom use.

---

## 11. Design system — klu corporate design

### 11.1 Source of truth
The visual identity follows the **Karl Landsteiner Privatuniversität (klu)** website `https://www.kl.ac.at`. Known facts: the brand writes itself in lowercase as "klu"; the institutional palette is built on a **dark blue** and a **red**; the site's claim is "We shape tomorrow's health."

**Task in Phase 7 (prepare in Phase 1):** extract the exact tokens instead of guessing:
1. Fetch `https://www.kl.ac.at/de`, locate the theme stylesheets (under `/themes/custom/karl_landsteiner/dist/`) and `…/dist/images/logo.svg`.
2. Extract: primary dark blue, red, neutrals/greys, any secondary colours, text colour, link colour, font families and weights, base font size, border radii.
3. Record them with source file + line in `docs/brand-tokens.md`, then encode them in `packages/shared/tokens.ts` and the Tailwind 4 `@theme` of both SPAs.
4. Until extraction is done, use these provisional tokens (clearly marked provisional in code): `--brand-navy: #1B2A4A`, `--brand-red: #C8102E`, `--ink: #1A1F2B`, `--paper: #FFFFFF`, `--mist: #EEF1F5`, `--line: #D5DBE3`.

### 11.2 Typography
- Use the klu web font family **only if** its licence permits self-hosting for this use (open licences such as OFL). Never hotlink from kl.ac.at, never copy commercially licensed font files.
- If the klu font is commercial, choose the closest open-licensed match by classification and self-host it (woff2, `font-display: swap`): humanist sans → *Source Sans 3*; geometric sans → *Figtree*; neo-grotesque → *Inter Tight*. Record the decision and reasoning in `docs/brand-tokens.md`.
- One family, weights 400/600/700 only. Tabular numerals (`font-variant-numeric: tabular-nums`) for counts, percentages, timers, join code, points.

### 11.3 Logo
- Do **not** place the klu logo by default. Provide a config slot `BRAND_LOGO_ENABLED=false` and an SVG slot; using the university logo needs approval from klu communications. Product mark = the word "Pulse" set in the brand font, navy, with a small red dot (the "live" signal) — that dot is also the favicon and add-in icon.

### 11.4 Colour usage rules
- Navy carries structure: headings, bars, primary buttons, stage background in dark theme.
- **Red is the single accent and is rare:** the live dot, the join code digits on the stage, focus rings. Never use red for "wrong" answers (avoid the right/wrong colour clash with brand red) — wrong/correct are communicated by icon (check / cross) + opacity, not colour.
- Quiz option identification: four shapes (▲ ◆ ● ■) **plus** four colours derived from the brand palette (navy, red, and two extracted secondary colours; if klu has none, derive a muted teal and ochre with ≥ 3:1 contrast against the background and verify distinguishability with a deuteranopia simulation). Shapes are mandatory; colour is secondary.
- Word cloud: navy at varying opacity/weight; the single most frequent word in red. No rainbow palettes.
- Stage themes: **light** (paper background, navy ink) and **dark** (navy background, white ink, bars in white at 90 %). Both must reach WCAG AA for all text at the rendered size.

### 11.5 Layout & motion
- Stage composition: prompt top-left aligned (not centred), join strip as a calm band along the top edge, visualisation fills the rest. Generous margins (≥ 4 cqw). Left alignment throughout except the quiz countdown.
- Participant app: single column, max width 520 px, left-aligned text, sticky primary button at the bottom on mobile.
- Motion only where it shows change: bar growth (400 ms ease-out), new word/card fade-in (250 ms), quiz countdown (the one expressive moment). Everything respects `prefers-reduced-motion` (reduce to instant/opacity changes).
- Radii: follow the extracted klu value; one radius for controls, cards with the same value — no mixed pill/round chaos.

### 11.6 Explicitly forbidden
Gradient washes, glassmorphism, drop shadows as decoration, emoji in UI, confetti, all-caps eyebrow labels above headings, "→" appended to button text, middle-dot meta strings as decoration (the join strip's "domain · code" is functional and allowed), stock illustrations, generic SaaS card grids, lorem ipsum anywhere.

### 11.7 Copy
Plain, short, active. Errors state what happened and what to do ("Diesen Code gibt es nicht. Bitte prüfen."). No apologies, no exclamation marks except the quiz result ("Richtig!"). Empty states invite action ("Noch keine Antworten. Code: 482 913").

---

## 12. Development environment

- `pnpm dev` starts: Postgres (Docker, `infra/docker-compose.dev.yml`), the Fastify server on **https://localhost:3443** with certificates from `office-addin-dev-certs` (`npx office-addin-dev-certs install`), and both Vite apps in **middleware mode inside the server** (single origin in dev too: `/` participant, `/addin/` add-in, `/api`, `/socket.io`).
- Phones in dev: `cloudflared tunnel --url https://localhost:3443` (quick tunnel). Set `PUBLIC_BASE_URL` to the tunnel URL so stage QR/join strip show the reachable address. Document this in `docs/sideloading.md`.
- Add-in harness at `https://localhost:3443/addin/?harness=1` (§6.9).
- Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `test:load`, `db:generate`, `db:migrate`, `manifest:build`, `manifest:validate`.

---

## 13. Sideloading & rollout (document in `docs/sideloading.md`)

- **Windows (dev):** `npx office-addin-debugging start apps/addin/public/manifest.dev.xml desktop --app powerpoint`. Alternative for testers: shared-folder catalog (network share containing `manifest.xml`, added under *Trust Center → Trusted Add-in Catalogs*, "Show in Menu" checked), then *Insert → My Add-ins → Shared Folder*.
- **Mac:** copy `manifest.xml` to `~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef/` (create `wef` if missing), restart PowerPoint, *Insert → My Add-ins*.
- **Later, university-wide:** Microsoft 365 admin center → Integrated apps → upload custom app (manifest file) → assign to a pilot security group first. **[VERIFY]** current menu naming at the time of rollout and note it in the doc.
- Updating: web code updates are live immediately (the add-in is a hosted web page); only manifest changes require redeploying the manifest.

---

## 14. Production deployment (document in `docs/deployment.md`)

- `infra/docker-compose.yml`: `postgres:16` (named volume, healthcheck), `server` (built from `infra/Dockerfile.server`, non-root user, `restart: unless-stopped`), `caddy:2` (ports 80/443, `Caddyfile` with `{{APP_DOMAIN}}` reverse-proxying to `server:3000`, WebSocket support is automatic).
- Nightly `pg_dump` to a volume, keep 7 days.
- Target for testing: EU VPS with 2 vCPU / 4 GB RAM. Must also run on a university Linux VM without changes (only DNS + firewall 80/443 needed; participants on mobile data must be able to reach it — note this for the uni IT discussion).
- Health: `/healthz` used by Docker healthcheck.
- Zero-downtime is not required; document "deploy outside lecture times".

---

## 15. Testing

- **Unit (Vitest):** zod schemas, quiz scoring incl. edge times, word normalisation, join-code generator (rejection rules, collision retry), CSV writer (BOM, semicolons, quoting of `;`, `"` and newlines), throttle utility, token signing/expiry/single-use.
- **Integration (Vitest + real Postgres):** presenter connect creates deck; activate MC; 3 participants vote; presenter receives aggregate; duplicate vote rejected; reconnect with same `clientResponseId` is idempotent; quiz phases with fake timers incl. `TOO_LATE`; deactivate race (A activates, B activates, A's late deactivate must not clear B).
- **E2E (Playwright):** participant flows for every type on Pixel 5 and iPhone 13 viewports, DE and EN, against the add-in harness as presenter.
- **Load (`pnpm test:load`):** 250 simulated participants join one deck within 20 s; scenario per type (MC, word cloud with 3 entries each, quiz with all answering in the 20 s window). Pass: 0 lost responses, p95 submit-ack < 300 ms, presenter receives ≤ 4 updates/s, server RSS < 300 MB. Report numbers in `docs/progress.md`.
- **Manual protocol (`docs/manual-test-protocol.md`)**, to be run by Tobias on Windows and Mac: insert, edit, duplicate slide, save/close/reopen, open file on a second PC, slideshow with presenter view on two monitors, Wi-Fi off/on during slideshow, 3 phones joined, export opens in Excel with correct umlauts and columns.

---

## 16. Phases & acceptance criteria

> Claude Code cannot operate PowerPoint. Wherever a phase needs real PowerPoint verification, build the test artefact plus a precise checklist, then **stop and ask Tobias to run it and paste the results**. Record his results in `docs/phase0-findings.md` / `docs/progress.md` before continuing.

**Phase 0 — Office spike (throwaway, `spikes/office-spike/`)**
Minimal content add-in (static HTML + Office.js, served via dev certs) that displays and logs: platform, display language, active view (with `ActiveViewChanged` events), selected `SlideRange` ids (on click, on `DocumentSelectionChanged`, and via 1 s polling), its own settings (with buttons: write random value, save, read back), `localStorage` read/write, attempt to access a document-level store (`PowerPoint.run` → `presentation.tags`, and custom document properties) with success/failure output, and frame size.
Checklist covers every **[VERIFY]** in this document, on Windows and Mac, including presenter view and slide duplication.
*Accept when:* `docs/phase0-findings.md` contains a filled Win/Mac result table and a "Decisions" section choosing the deck-linking path (§6.4) and duplicate-detection path (§6.5). Adjust §6 implementation plan accordingly (note deviations in the doc, do not silently change behaviour).

**Phase 1 — Foundations**
Monorepo, shared package (schemas, contracts, i18n skeleton, provisional tokens), Drizzle schema + migrations, Fastify + Socket.IO skeleton, HTTPS single-origin dev setup, `CLAUDE.md` with conventions from this prompt, ESLint/Prettier/typecheck in CI script.
*Accept when:* `pnpm dev` serves `/`, `/addin/?harness=1`, `/healthz` over HTTPS; `pnpm typecheck && pnpm lint && pnpm test` green.

**Phase 2 — Realtime core + participant app + multiple choice**
Presenter/participant namespaces, deck creation, join codes, activation logic incl. race safety, aggregation + throttling, reconnect + idempotent submissions, participant app (code entry, waiting, MC answering, confirmation, connection banner), harness presenter with MC stage.
*Accept when:* harness + 3 browser tabs as participants: live bars update; duplicate vote rejected; killing and restarting the server mid-session recovers without data loss; integration tests green.

**Phase 3 — Real add-in for multiple choice**
Office wrappers, settings persistence, editor + stage for MC, view switching, slide-identity activation, deck linking and duplicate detection per Phase 0 decisions, offline-safe stage, export link via `openBrowserWindow`.
*Accept when:* Tobias's manual checklist for MC passes on Windows and Mac.

**Phase 4 — Word cloud, open text, scale** (editor, stage, participant UI, aggregation, hide action). *Accept when:* harness e2e + manual checks pass.

**Phase 5 — Quiz, leaderboard, Q&A + Q&A wall.** *Accept when:* quiz timing correct within ±250 ms across 3 devices; scoring unit tests green; leaderboard correct after 3 quiz slides; Q&A upvotes consistent across clients.

**Phase 6 — Dashboard, exports, reset, deletion, retention, privacy page.** *Accept when:* CSV opens in German Excel with correct columns/umlauts without import wizard; XLSX has one sheet per question + summary; retention job verified with a fake clock.

**Phase 7 — Design system & quality pass.** Extract klu tokens (§11.1), apply typography/colour/motion rules, light/dark stage, i18n completeness check (script that fails on missing keys), axe accessibility scan with zero serious/critical issues on participant app, reduced-motion verified. Take screenshots of every stage type in both themes at 1920×1080 and of every participant screen at 390×844; review them against §11 and fix deviations before accepting.

**Phase 8 — Load, deploy, docs.** Load test results recorded; Docker/Caddy production stack; `docs/deployment.md`, `docs/sideloading.md`, `docs/presenter-guide.de.md` (one page, German, for lecturers: install, create, duplicate, present, export); final manual protocol run by Tobias.

---

## 17. Definition of done

- All six question types, leaderboard and Q&A wall work end-to-end in PowerPoint for Windows and Mac.
- 250 concurrent participants verified by load test.
- No presenter login; everything a presenter needs is in the .pptx plus the installed add-in.
- Slide never renders blank, even offline.
- Exports correct in German Excel.
- No IPs or personal identifiers in the database; 90-day retention active.
- klu design tokens extracted and documented; UI matches §11 and avoids everything in §11.6.
- `typecheck`, `lint`, unit, integration, e2e and load tests green; docs complete.

---

## 18. Working rules for Claude Code

- Read this whole document before writing code. Generate `CLAUDE.md` in Phase 1 summarising the conventions, and keep it updated.
- Small, reviewable commits per logical step, Conventional Commits (`feat(server): …`).
- When something in this prompt is impossible or contradicts a verified platform behaviour, stop, explain the conflict in `docs/progress.md` with two concrete options, and ask — do not improvise around it.
- Never introduce new runtime dependencies beyond §2 without stating why in `docs/progress.md`.
- Never weaken a security or privacy rule to make something work.
