import { QUIZ_COLORS, QUIZ_SHAPES, type QuizShape as Shape } from '@pulse/shared';

const PATHS: Record<Shape, string> = {
  triangle: 'M12 3.5L21.5 20h-19z',
  diamond: 'M12 2.5l9.5 9.5-9.5 9.5L2.5 12z',
  circle: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z',
  square: 'M4 4h16v16H4z',
  'triangle-down': 'M12 20.5L2.5 4h19z',
  hexagon: 'M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z',
};

/** Shape first, colour second (§11.4): option identity never depends on colour alone. */
export function QuizShapeIcon({ index, size = 28, color }: { index: number; size?: number; color?: string }) {
  const shape = QUIZ_SHAPES[index % QUIZ_SHAPES.length] ?? 'circle';
  const fill = color ?? QUIZ_COLORS[index % QUIZ_COLORS.length];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[shape]} fill={fill} />
    </svg>
  );
}
