import type { Language, SlideItemConfig, Theme } from '@pulse/shared';
import { useState } from 'react';
import { previewResults } from '../editor/previewData';
import type { ItemLiveState } from '../live/live';
import { Stage } from './Stage';

const deckId = '11111111-1111-4111-8111-111111111111';
const base = {
  deckId,
  schemaVersion: 1 as const,
  kind: 'question' as const,
  resultsVisibility: 'live' as const,
  showOnPhone: false,
};
const id = (n: number): string => `00000000-0000-4000-8000-00000000000${n}`;

const SAMPLES: Record<string, SlideItemConfig> = {
  multiple_choice: {
    ...base,
    id: id(1),
    type: 'multiple_choice',
    prompt: 'Welches Organ produziert Insulin?',
    options: [
      { id: 'a', label: 'Leber' },
      { id: 'b', label: 'Bauchspeicheldrüse' },
      { id: 'c', label: 'Niere' },
      { id: 'd', label: 'Milz' },
    ],
    allowMultiple: false,
    correctOptionIds: ['b'],
  },
  word_cloud: {
    ...base,
    id: id(2),
    type: 'word_cloud',
    prompt: 'Ein Wort zur heutigen Vorlesung',
    entriesPerParticipant: 3,
  },
  open_text: { ...base, id: id(3), type: 'open_text', prompt: 'Was war heute unklar?', entriesPerParticipant: 1 },
  scale: {
    ...base,
    id: id(4),
    type: 'scale',
    prompt: 'Wie bewerten Sie die heutige Einheit?',
    statements: [
      { id: 's1', label: 'Verständlichkeit' },
      { id: 's2', label: 'Tempo' },
      { id: 's3', label: 'Praxisbezug' },
    ],
    range: 5,
    minLabel: 'gar nicht',
    maxLabel: 'sehr',
  },
  quiz: {
    ...base,
    id: id(5),
    type: 'quiz',
    prompt: 'Wie hoch ist der normale pH-Wert des Blutes?',
    options: [
      { id: 'a', label: '7,0' },
      { id: 'b', label: '7,4' },
      { id: 'c', label: '7,8' },
      { id: 'd', label: '6,8' },
    ],
    correctOptionId: 'b',
    timeLimitSec: 20,
    startMode: 'auto',
  },
  leaderboard: { id: id(6), deckId, schemaVersion: 1, kind: 'leaderboard' },
  qa_wall: { id: id(7), deckId, schemaVersion: 1, kind: 'qa_wall' },
};

/**
 * Development gallery for design review (§16 Phase 7 screenshots): every stage type with sample data.
 *   /addin/?gallery=<type>&theme=light|dark&state=answering|countdown|reveal|idle&lang=de|en&offline=1
 */
export function Gallery({ params }: { params: URLSearchParams }) {
  const [now] = useState(() => Date.now());
  const kind = params.get('gallery') ?? 'multiple_choice';
  const config = SAMPLES[kind] ?? SAMPLES.multiple_choice ?? null;
  const sample = previewResults(config);
  const stateParam = params.get('state');
  let item: ItemLiveState = sample.item;
  if (stateParam === 'countdown') item = { state: 'countdown', revealed: false, phaseEndsAt: now + 2400 };
  if (stateParam === 'answering') item = { state: 'answering', revealed: false, phaseEndsAt: now + 12_400 };
  if (stateParam === 'reveal') item = { state: 'reveal', revealed: true, phaseEndsAt: null };
  if (stateParam === 'idle') item = { state: 'idle', revealed: false, phaseEndsAt: null };
  const language: Language = params.get('lang') === 'en' ? 'en' : 'de';
  const theme: Theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  return (
    <Stage
      data={{
        language,
        theme,
        showQr: true,
        joinCode: '482913',
        baseUrl: 'https://pulse.example.at',
        qaEnabled: true,
        config,
        draft: null,
        item,
        results: params.get('empty') ? null : sample.results,
        participants: 42,
        leaderboard: sample.leaderboard,
        qa: sample.qa,
        connected: !params.get('offline'),
        clockOffset: 0,
      }}
      actions={params.get('quizStart') ? { startQuiz: () => undefined, reveal: () => undefined } : {}}
      joinOverlay
    />
  );
}
