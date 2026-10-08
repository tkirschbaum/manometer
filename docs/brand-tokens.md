# Design tokens

Pulse has its own look (no university corporate design): a friendly indigo-blue primary, a six-colour palette for
charts and quiz answers, generous rounding and the open-licensed font **Figtree**. The style is oriented on
Mentimeter: one bold question, large colourful results, calm white space.

## Where the tokens live

| Place | What |
|---|---|
| `packages/shared/src/tokens.ts` | Source of truth for TypeScript (palette, text colours on the palette, font stack) |
| `apps/participant/src/index.css` `@theme` | Tailwind 4 tokens of the phone app (`--radius-brand: 16px`) |
| `apps/addin/src/index.css` `@theme` | Tailwind 4 tokens of the editor (`--radius-brand: 8px`) |
| `apps/addin/src/stage/stage.css` | Slide (stage) colours incl. the dark theme (`--c1`…`--c6`, `--on-c1`…`--on-c6`) |
| `apps/addin/index.html` | Colours of the startup placeholder (`public/boot.js`) |

Change them together.

## Colours

| Token | Value | Use | Contrast on white |
|---|---|---|---|
| ink | `#101834` | headings, body text | 17.5 : 1 |
| muted | `#5D6585` | secondary text | 5.7 : 1 (5.3 : 1 on mist) |
| line | `#E2E5EF` | borders | — |
| mist | `#F4F5FA` | panels, input backgrounds, code pill | — |
| paper | `#FFFFFF` | background | — |
| primary | `#3D5AF1` | buttons, join code, selection, timer | 5.3 : 1 |
| primary-dark | `#2C45D1` | hover | 7.3 : 1 |
| primary-soft | `#EEF1FF` | selected answer, vote pill | — |
| coral | `#F0574A` | wrong answer, live accent | 3.4 : 1 (large text and shapes only) |
| ok | `#16A37F` | "answer sent", correct answer | 3.2 : 1 (icons and large text only) |

### Palette (charts and quiz answers, in option order)

| # | Colour | Text on it | Shape (quiz) |
|---|---|---|---|
| 1 | `#3D5AF1` blue | white | triangle |
| 2 | `#F0574A` coral | white | diamond |
| 3 | `#F5A524` amber | ink `#101834` | circle |
| 4 | `#16A37F` green | white | square |
| 5 | `#7C5CF0` violet | white | triangle down |
| 6 | `#E04A8A` pink | white | hexagon |

Quiz answers are never told apart by colour alone: every answer also has its shape (§11.4). Text on the tiles is
bold and at least 3.2 % of the slide height, so the large-text contrast rule (≥ 3 : 1) applies. Word clouds leave
amber out (too light for text on white).

### Dark slide theme (`.stage.theme-dark`)

Background `#141B3D`, panels `#1E2754`, ink white, muted `#AAB3D1`, primary `#7B91FF`. The palette is brighter
(`#6B84FF`, `#FF7A6E`, `#FFC04D`, `#2FD3A3`, `#A18BFF`, `#FF6FAE`) and carries dark ink `#101834` on filled tiles
(≥ 5 : 1 for all six).

## Font

**Figtree** (SIL Open Font License), weights 400/600/700/800, Latin subset, self-hosted via `@fontsource/figtree`
(woff2 with woff fallback, `font-display: swap`). Tabular numerals (verified) for counts, percentages, timers, the
join code and points. Questions on slides use 800, answers 700.

## Shapes and radius

Buttons are pills (`rounded-full`). Cards and answer tiles: 16 px on phones, 8 px in the editor, `1.4 % of the slide
height` on slides. The join code sits in a pill on the slide.

## Logo and icons

No university logo. The product mark is a blue rounded square with a white pulse line plus the word "Pulse"; the
same badge is the favicon, the add-in icon (`apps/addin/public/assets/icon-*.png`) and the phone app icon
(`apps/participant/public/icon-*.png`). The PNGs are rendered from `favicon.svg`.
