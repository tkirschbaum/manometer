import { QUIZ_SHAPES } from '@pulse/shared';

const PATHS: Record<(typeof QUIZ_SHAPES)[number], string> = {
  triangle: 'M12 3.5L21.5 20h-19z',
  diamond: 'M12 2.5l9.5 9.5-9.5 9.5L2.5 12z',
  circle: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z',
  square: 'M4 4h16v16H4z',
  'triangle-down': 'M12 20.5L2.5 4h19z',
  hexagon: 'M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z',
};

const VARS = ['--q1', '--q2', '--q3', '--q4', '--q1', '--q2'];

/** Quiz option identity: shape first, colour second (§11.4); colours follow the stage theme. */
export function QuizShape({ index }: { index: number }) {
  const shape = QUIZ_SHAPES[index % QUIZ_SHAPES.length] ?? 'circle';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[shape]} fill={`var(${VARS[index % VARS.length] ?? '--q1'})`} />
    </svg>
  );
}
