/**
 * Design tokens (master prompt §11).
 *
 * PROVISIONAL: the klu tokens could not be extracted yet (the build environment's network policy blocks
 * www.kl.ac.at). These are the provisional values from §11.1 step 4; teal and ochre are derived per §11.4.
 * Replace them here and in the two `@theme` blocks (apps/addin/src/index.css, apps/participant/src/index.css)
 * once docs/brand-tokens.md is filled from the real stylesheets.
 */
export const TOKENS_PROVISIONAL = true;

export const tokens = {
  color: {
    navy: '#1B2A4A',
    red: '#C8102E',
    ink: '#1A1F2B',
    paper: '#FFFFFF',
    mist: '#EEF1F5',
    line: '#D5DBE3',
    muted: '#5B6573',
    /** Derived secondary colours for quiz options (≥ 3:1 against paper). */
    teal: '#1F6F6B',
    ochre: '#8F6410',
  },
  radius: '6px',
  fontFamily: "'Source Sans 3', 'Segoe UI', system-ui, sans-serif",
} as const;

/** Quiz option identity: shape first, colour second (§11.4). */
export const QUIZ_SHAPES = ['triangle', 'diamond', 'circle', 'square', 'triangle-down', 'hexagon'] as const;
export type QuizShape = (typeof QUIZ_SHAPES)[number];
export const QUIZ_COLORS = [tokens.color.navy, tokens.color.red, tokens.color.teal, tokens.color.ochre, tokens.color.navy, tokens.color.red] as const;
