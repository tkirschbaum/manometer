import { QUIZ_SHAPES } from '@pulse/shared';

const PATHS: Record<(typeof QUIZ_SHAPES)[number], string> = {
  triangle: 'M12 3.5L21.5 20h-19z',
  diamond: 'M12 2.5l9.5 9.5-9.5 9.5L2.5 12z',
  circle: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z',
  square: 'M4 4h16v16H4z',
  'triangle-down': 'M12 20.5L2.5 4h19z',
  hexagon: 'M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z',
};

/**
 * Quiz option identity: shape first, colour second (§11.4). The shape is filled with the option's palette colour
 * (`--c1`…`--c6` of the stage theme); `plain` uses the current text colour instead (on a filled tile).
 */
export function QuizShape({ index, plain = false }: { index: number; plain?: boolean }) {
  const shape = QUIZ_SHAPES[index % QUIZ_SHAPES.length] ?? 'circle';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="quiz-shape">
      <path d={PATHS[shape]} fill={plain ? 'currentColor' : `var(--c${String((index % 6) + 1)})`} />
    </svg>
  );
}
