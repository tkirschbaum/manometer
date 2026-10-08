/**
 * Design tokens. Pulse has its own look (no longer the provisional klu tokens): a friendly indigo-blue primary,
 * a coral "live" accent and a six-colour chart palette, set in Figtree. Keep in sync with the `@theme` blocks
 * (apps/addin/src/index.css, apps/participant/src/index.css) and the stage variables (apps/addin/src/stage/stage.css).
 * Contrast: every chart colour ≥ 3:1 against white except amber, which always carries dark text (docs/brand-tokens.md).
 */
export const tokens = {
  color: {
    ink: '#101834',
    muted: '#5d6585',
    line: '#e2e5ef',
    mist: '#f4f5fa',
    paper: '#ffffff',
    primary: '#3d5af1',
    primaryDark: '#2c45d1',
    primarySoft: '#eef1ff',
    coral: '#f0574a',
  },
  /** Chart and quiz colours in option order. */
  palette: ['#3d5af1', '#f0574a', '#f5a524', '#16a37f', '#7c5cf0', '#e04a8a'],
  /** Text colour on a filled palette tile (amber needs dark text). */
  paletteText: ['#ffffff', '#ffffff', '#101834', '#ffffff', '#ffffff', '#ffffff'],
  radius: '14px',
  fontFamily: "'Figtree', 'Segoe UI', system-ui, sans-serif",
} as const;

/** Quiz option identity: shape first, colour second. */
export const QUIZ_SHAPES = ['triangle', 'diamond', 'circle', 'square', 'triangle-down', 'hexagon'] as const;
export type QuizShape = (typeof QUIZ_SHAPES)[number];
export const QUIZ_COLORS = tokens.palette;
export const QUIZ_TEXT_COLORS = tokens.paletteText;
