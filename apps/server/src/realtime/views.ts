import type { ItemState, PublicItemView, SlideItemConfig } from '@pulse/shared';

export interface ItemStatus {
  state: ItemState;
  revealed: boolean;
  phaseEndsAt: number | null;
}

/** The participant-facing view of an item. Correct answers only after reveal (§5.3). */
export function toPublicItemView(config: SlideItemConfig, status: ItemStatus): PublicItemView {
  const view: PublicItemView = {
    id: config.id,
    kind: config.kind,
    type: null,
    prompt: '',
    state: status.state,
    revealed: status.revealed,
    phaseEndsAt: status.phaseEndsAt,
    options: [],
    allowMultiple: false,
    maxSelections: null,
    entriesPerParticipant: 1,
    statements: [],
    range: 5,
    minLabel: null,
    maxLabel: null,
    timeLimitSec: null,
    correctOptionIds: null,
    showOnPhone: false,
  };
  if (config.kind !== 'question') return view;
  view.type = config.type;
  view.prompt = config.prompt;
  view.showOnPhone = config.showOnPhone;
  switch (config.type) {
    case 'multiple_choice':
      view.options = config.options;
      view.allowMultiple = config.allowMultiple;
      view.maxSelections = config.allowMultiple ? (config.maxSelections ?? config.options.length) : 1;
      if (status.revealed && config.correctOptionIds?.length) view.correctOptionIds = config.correctOptionIds;
      break;
    case 'word_cloud':
    case 'open_text':
      view.entriesPerParticipant = config.entriesPerParticipant;
      break;
    case 'scale':
      view.statements = config.statements;
      view.range = config.range;
      view.minLabel = config.minLabel ?? null;
      view.maxLabel = config.maxLabel ?? null;
      break;
    case 'quiz':
      view.options = config.options;
      view.timeLimitSec = config.timeLimitSec;
      if (status.state === 'reveal') view.correctOptionIds = [config.correctOptionId];
      break;
  }
  return view;
}

/** Initial state when an item is activated for the first time (§5.3 item:activate). */
export function initialActiveState(config: SlideItemConfig): ItemState {
  if (config.kind === 'question' && config.type === 'quiz') return 'idle';
  return 'open';
}
