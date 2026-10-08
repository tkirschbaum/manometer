# Pulse — conventions for Claude Code sessions

Live voting inside PowerPoint (content add-in) + phone web app + one Node server. The full specification is
`docs/master-prompt.md`; status, deviations and open issues are in `docs/progress.md`. Read both before larger
changes, and add a report to `docs/progress.md` after each.

## Layout

- `packages/shared` — zod contracts (`schemas.ts`, `events.ts`), constants, i18n dictionaries (`i18n/de.ts`,
  `i18n/en.ts`, same keys), design tokens. Uses **`zod/mini`** (participant bundle budget ≤ 120 kB gz).
- `apps/server` — Fastify 5 + Socket.IO 4 + Drizzle. `env.ts` (zod env), `db/` (schema, client: PostgreSQL via
  `DATABASE_URL`, else embedded PGlite), `realtime/` (hub, io wiring, results, throttling), `http/` (routes,
  security headers, export, static/dev serving), `domain/` (pure logic), `jobs/retention.ts`. Classic `zod` is fine
  here.
- `apps/participant` — phone SPA under `/` (React 19, Tailwind 4).
- `apps/addin` — PowerPoint add-in SPA under `/addin/`: `office/` is the **only** place that touches Office.js
  (`OfficeHost` interface; `harnessHost.ts` replaces it in the browser harness), `controller.ts` (state machine,
  external store), `live/` (presenter socket), `editor/`, `stage/` (the slide), `model/` (item drafts, settings).
- `infra/` — Dockerfile, Compose (prod + dev DB), Caddyfile. `scripts/` — dev, local setup, manifest, load test.
- `spikes/office-spike` — Phase 0 throwaway; not linted, not part of the build.

## Commands

```bash
pnpm dev            # https://localhost:3443, Vite middleware; harness: /addin/?harness=1
pnpm check          # typecheck + lint + vitest (unit + integration; PGlite unless DATABASE_URL is set)
pnpm build          # manifests + all apps (server → apps/server/dist, SPAs → apps/*/dist)
pnpm test:e2e       # Playwright against the built server (needs `pnpm build`)
pnpm test:load      # 250 participants (needs `pnpm build`)
pnpm format         # prettier (120 cols, single quotes)
```

In the cloud container Chromium is at `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Rules

- TypeScript strict, ESLint `strictTypeChecked`, zero warnings. Prettier formatting.
- Every socket event and HTTP body is validated on the server with the shared schemas; clients never trust each
  other. Socket payloads ≤ 4 kB.
- User text is rendered as text only: **no `dangerouslySetInnerHTML`, no `innerHTML`** (lint-enforced).
- Never show or log the deck secret; compare secrets in constant time. No IP addresses or user agents anywhere
  (logs, database); no answer texts in logs. Retention default 90 days.
- All UI strings go through the dictionaries (DE and EN, identical keys). German UI copy: short and impersonal ("Bitte … prüfen"), no "du".
- New runtime dependencies only with a reason in `docs/progress.md` (§2 lists the fixed stack).
- Stage (slide) sizes: use `var(--u)`/`var(--uw)` (1 % of the measured frame height/width, set in `Stage.tsx`),
  never container query units (`cqh`/`cqw`): PowerPoint's Mac web view rendered font sizes in cq units ~2× too large.
- Add-in: no history API routing (Office.js nulls `history.pushState`; `public/history-guard.js`), feature-detect
  every API beyond the common API, keep `PowerPoint.run` calls behind `OfficeHost` with fallbacks.
- Tests: domain logic → Vitest unit tests; server flows → `apps/server/test` (real database); participant flows →
  `e2e/` with the harness as presenter. Do not skip or weaken tests to get green.
- Commit messages: imperative, scoped (`feat(addin): …`, `fix(server): …`, `docs: …`).
