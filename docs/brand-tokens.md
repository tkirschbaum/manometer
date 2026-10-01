# Brand tokens (klu corporate design)

**Status: PROVISIONAL.** The exact klu tokens have not been extracted yet: the cloud build environment cannot reach
`https://www.kl.ac.at` (network policy). All values below are the provisional values from master prompt §11.1
step 4 plus derived colours. They are flagged in code with `TOKENS_PROVISIONAL = true`
(`packages/shared/src/tokens.ts`).

## Where the tokens live

| Place | What |
|---|---|
| `packages/shared/src/tokens.ts` | Source of truth for TypeScript (quiz colours, font stack, radius) |
| `apps/participant/src/index.css` `@theme` | Tailwind 4 tokens of the phone app |
| `apps/addin/src/index.css` `@theme` | Tailwind 4 tokens of the editor |
| `apps/addin/src/stage/stage.css` | Slide (stage) colours incl. the dark theme |

Change all four together.

## Current values

| Token | Value | Use | Contrast on white |
|---|---|---|---|
| navy | `#1B2A4A` | headings, primary buttons, bars | 14.2 : 1 |
| red | `#C8102E` | live dot, accent, correct-answer marker | 5.9 : 1 |
| ink | `#1A1F2B` | body text | — |
| paper | `#FFFFFF` | background | — |
| mist | `#EEF1F5` | light panels | — |
| line | `#D5DBE3` | borders | — |
| muted | `#5B6573` | secondary text (derived) | 5.9 : 1 (5.2 : 1 on mist) |
| teal | `#1F6F6B` | quiz option 3 (derived, §11.4) | 5.9 : 1 |
| ochre | `#8F6410` | quiz option 4 (derived, §11.4) | 5.3 : 1 |
| radius | `6px` | buttons, cards | — |

Dark slide theme (`.stage.theme-dark`): background navy, ink white, bars white 90 %, accent `#FF7A8C` (the brand red
is too dark on navy; `#FF7A8C` has 5.7 : 1 on navy), quiz colours `#E8ECF2`, `#FF7A8C`, `#5FB3AC`, `#D9A441`.

## Font

**Source Sans 3** (SIL Open Font License), weights 400/600/700, Latin subset, self-hosted via
`@fontsource/source-sans-3` (woff2 with woff fallback, `font-display: swap`). Tabular numerals for counts,
percentages, timers, the join code and points.

Reasoning: the klu web font could not be inspected. §11.2 allows only open-licensed fonts for self-hosting and maps
"humanist sans" → Source Sans 3; without access to the site that is the default chosen here. If extraction shows a
geometric family, switch to *Figtree*, for a neo-grotesque to *Inter Tight* (one line in each `@theme` plus the
`@fontsource` import).

## Logo

No klu logo is used (needs approval by klu communications, §11.3). The product mark is the word "Pulse" in navy
with a small red "live" dot; the same dot is the favicon and add-in icon. A `BRAND_LOGO_ENABLED` slot is **not
implemented yet** (see progress.md, open issues).

## How to extract the real tokens (≈ 20 minutes, needs normal internet)

1. Open `https://www.kl.ac.at/de` in Chrome → DevTools → *Network* → filter `css` → reload. The theme stylesheets are
   under `/themes/custom/karl_landsteiner/dist/`. The logo is `…/dist/images/logo.svg`.
2. In *Elements → Computed* of a heading, a body paragraph, a link, a button and the header bar, note: colour,
   background, font family, weight, size, border radius.
3. Search the stylesheets for `--` custom properties and for the hex values found in step 2; note neutrals/greys and
   secondary colours.
4. `@font-face` rules tell the font family and where it comes from; check its licence (OFL → may be self-hosted;
   commercial → keep Source Sans 3 / the closest open match).
5. Record each value here with **source file + line**, replace the values in the four places listed above, set
   `TOKENS_PROVISIONAL = false`, re-check the contrast column (≥ 4.5 : 1 for text, ≥ 3 : 1 for bars and icons), run
   `pnpm build && pnpm test:e2e` (includes the axe contrast scan).

A Claude Code session on a computer with normal internet access can do steps 1–5 automatically: "Extract the klu
tokens as described in docs/brand-tokens.md".
