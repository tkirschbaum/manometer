import {
  LIMITS,
  newShortId,
  newUuid,
  slideItemConfigSchema,
  type MessageKey,
  type QuestionType,
  type SlideItemConfig,
} from '@pulse/shared';
import type { ItemDraft } from './schemas';

export type SlideKind = QuestionType | 'leaderboard' | 'qa_wall';
export const SLIDE_KINDS: SlideKind[] = [
  'multiple_choice',
  'word_cloud',
  'open_text',
  'scale',
  'quiz',
  'leaderboard',
  'qa_wall',
];

export function kindOf(draft: ItemDraft): SlideKind {
  return draft.kind === 'question' ? draft.type : draft.kind;
}

export function newDraft(kind: SlideKind, previous?: ItemDraft | null): ItemDraft {
  const base: ItemDraft = previous ?? {
    id: newUuid(),
    kind: 'question',
    type: 'multiple_choice',
    prompt: '',
    resultsVisibility: 'live',
    showOnPhone: false,
    options: [
      { id: newShortId(), label: '' },
      { id: newShortId(), label: '' },
      { id: newShortId(), label: '' },
    ],
    allowMultiple: false,
    maxSelections: null,
    correctOptionIds: [],
    wordEntries: 3,
    textEntries: 1,
    statements: [{ id: newShortId(), label: '' }],
    range: 5,
    minLabel: '',
    maxLabel: '',
    quizCorrectOptionId: null,
    timeLimitSec: 20,
    startMode: 'auto',
  };
  if (kind === 'leaderboard' || kind === 'qa_wall') return { ...base, kind };
  return { ...base, kind: 'question', type: kind };
}

export type MissingKey = Extract<MessageKey, `editor.missing.${string}`>;

const filled = (list: { id: string; label: string }[]) => list.filter((o) => o.label.trim().length > 0);

/** What is still missing before the draft is a valid SlideItemConfig. */
export function missingFields(draft: ItemDraft): MissingKey[] {
  if (draft.kind !== 'question') return [];
  const missing: MissingKey[] = [];
  if (!draft.prompt.trim()) missing.push('editor.missing.prompt');
  if (draft.type === 'multiple_choice' || draft.type === 'quiz') {
    if (filled(draft.options).length < 2) missing.push('editor.missing.options');
    if (draft.type === 'quiz' && !filled(draft.options).some((o) => o.id === draft.quizCorrectOptionId)) {
      missing.push('editor.missing.correct');
    }
  }
  if (draft.type === 'scale' && filled(draft.statements).length < 1) missing.push('editor.missing.statements');
  return missing;
}

/** Builds and validates the server config from the draft (empty options are dropped). */
export function toConfig(draft: ItemDraft, deckId: string): SlideItemConfig | null {
  const common = { id: draft.id, deckId, schemaVersion: 1 as const };
  let candidate: unknown;
  if (draft.kind !== 'question') {
    candidate = { ...common, kind: draft.kind };
  } else {
    const question = {
      ...common,
      kind: 'question' as const,
      prompt: draft.prompt.trim().slice(0, LIMITS.promptMax),
      resultsVisibility: draft.resultsVisibility,
      showOnPhone: draft.showOnPhone,
    };
    const options = filled(draft.options).map((o) => ({ id: o.id, label: o.label.trim() }));
    switch (draft.type) {
      case 'multiple_choice': {
        const ids = new Set(options.map((o) => o.id));
        const correct = draft.correctOptionIds.filter((id) => ids.has(id));
        candidate = {
          ...question,
          type: 'multiple_choice',
          options,
          allowMultiple: draft.allowMultiple,
          ...(draft.allowMultiple && draft.maxSelections !== null
            ? { maxSelections: Math.min(Math.max(draft.maxSelections, 2), options.length) }
            : {}),
          ...(correct.length ? { correctOptionIds: correct } : {}),
        };
        break;
      }
      case 'word_cloud':
        candidate = { ...question, type: 'word_cloud', entriesPerParticipant: draft.wordEntries };
        break;
      case 'open_text':
        candidate = { ...question, type: 'open_text', entriesPerParticipant: draft.textEntries };
        break;
      case 'scale':
        candidate = {
          ...question,
          type: 'scale',
          statements: filled(draft.statements).map((s) => ({ id: s.id, label: s.label.trim() })),
          range: draft.range,
          ...(draft.minLabel.trim() ? { minLabel: draft.minLabel.trim() } : {}),
          ...(draft.maxLabel.trim() ? { maxLabel: draft.maxLabel.trim() } : {}),
        };
        break;
      case 'quiz':
        candidate = {
          ...question,
          type: 'quiz',
          options: options.slice(0, LIMITS.quizOptionsMax),
          correctOptionId: draft.quizCorrectOptionId,
          timeLimitSec: draft.timeLimitSec,
          startMode: draft.startMode,
        };
        break;
    }
  }
  const parsed = slideItemConfigSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Same draft as a separate question (copy detection, "Als neue Frage verwenden"). */
export function forkDraft(draft: ItemDraft): ItemDraft {
  return { ...draft, id: newUuid() };
}
