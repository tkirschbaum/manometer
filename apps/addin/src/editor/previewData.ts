import type { LeaderboardView, QaItemView, ResultsView, SlideItemConfig } from '@pulse/shared';
import type { ItemLiveState } from '../live/live';

/** Example data so the preview shows what the slideshow will look like (§6.8 "Vorschau"). */
export function previewResults(config: SlideItemConfig | null): {
  results: ResultsView | null;
  item: ItemLiveState;
  leaderboard: LeaderboardView;
  qa: QaItemView[];
} {
  // A quiz is previewed in its question phase (options + timer); everything else with results.
  const item: ItemLiveState =
    config?.kind === 'question' && config.type === 'quiz'
      ? { state: 'idle', revealed: false, phaseEndsAt: null }
      : { state: 'open', revealed: true, phaseEndsAt: null };
  const leaderboard: LeaderboardView = {
    entries: [
      { rank: 1, nickname: 'Lena', points: 2840 },
      { rank: 2, nickname: 'Jonas', points: 2615 },
      { rank: 3, nickname: 'Mira', points: 2390 },
      { rank: 4, nickname: 'Felix', points: 2010 },
      { rank: 5, nickname: 'Sara', points: 1875 },
      { rank: 6, nickname: 'David', points: 1690 },
    ],
    players: 42,
    quizCount: 3,
  };
  const now = Date.now();
  const qa: QaItemView[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      text: 'Kommt das Thema in der Prüfung vor?',
      upvotes: 14,
      answered: false,
      createdAt: now - 60_000,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      text: 'Können die Folien danach hochgeladen werden?',
      upvotes: 9,
      answered: false,
      createdAt: now - 50_000,
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      text: 'Gibt es eine Literaturliste?',
      upvotes: 4,
      answered: true,
      createdAt: now - 40_000,
    },
  ];
  if (config?.kind !== 'question') return { results: null, item, leaderboard, qa };
  const base = { itemId: config.id };
  switch (config.type) {
    case 'multiple_choice': {
      const weights = [14, 23, 6, 3, 2, 1, 1, 1];
      const counts = Object.fromEntries(config.options.map((o, i) => [o.id, weights[i] ?? 1]));
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return {
        results: { ...base, type: 'multiple_choice', counts, respondents: total, responses: total },
        item,
        leaderboard,
        qa,
      };
    }
    case 'quiz': {
      const weights = [5, 21, 8, 3, 2, 1];
      const counts = Object.fromEntries(config.options.map((o, i) => [o.id, weights[i] ?? 1]));
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return {
        results: { ...base, type: 'quiz', counts, respondents: total, responses: total },
        item: { state: 'answering', revealed: false, phaseEndsAt: Date.now() + config.timeLimitSec * 600 },
        leaderboard,
        qa,
      };
    }
    case 'word_cloud': {
      const words = [
        'Neugier',
        'Teamarbeit',
        'Praxis',
        'Anatomie',
        'Zeit',
        'Fragen',
        'Struktur',
        'Beispiele',
        'Pausen',
        'Motivation',
        'Klarheit',
        'Tempo',
      ];
      return {
        results: {
          ...base,
          type: 'word_cloud',
          words: words.map((w, i) => ({ key: w.toLowerCase(), text: w, count: Math.max(1, 18 - i * 2) })),
          respondents: 31,
          responses: 74,
        },
        item,
        leaderboard,
        qa,
      };
    }
    case 'open_text': {
      const texts = [
        'Mehr Fallbeispiele aus der Klinik wären hilfreich.',
        'Gutes Tempo heute.',
        'Die Grafik zum Kreislauf war sehr anschaulich.',
        'Bitte die Literaturangaben auf die letzte Folie.',
        'Wie hängt das mit dem Thema von letzter Woche zusammen?',
        'Kurze Wiederholung am Anfang finde ich gut.',
      ];
      return {
        results: {
          ...base,
          type: 'open_text',
          entries: texts.map((text, i) => ({ id: String(i + 1), text, at: now - i * 30_000 })),
          respondents: texts.length,
          responses: texts.length,
        },
        item,
        leaderboard,
        qa,
      };
    }
    case 'scale': {
      const shape = config.range === 5 ? [1, 3, 8, 14, 6] : [0, 1, 1, 2, 4, 6, 9, 7, 3, 1];
      return {
        results: {
          ...base,
          type: 'scale',
          statements: config.statements.map((s, i) => {
            const histogram = shape.map((n, j) => Math.max(0, n + ((i + j) % 3) - 1));
            const n = histogram.reduce((a, b) => a + b, 0);
            const sum = histogram.reduce((a, b, j) => a + b * (j + 1), 0);
            return { id: s.id, n, average: n ? sum / n : null, histogram };
          }),
          respondents: 32,
          responses: 32,
        },
        item,
        leaderboard,
        qa,
      };
    }
  }
}
