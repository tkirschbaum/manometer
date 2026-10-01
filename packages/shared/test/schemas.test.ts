import { describe, expect, it } from 'vitest';
import {
  dictionaries,
  formatJoinCode,
  newDeckSecret,
  newShortId,
  newUuid,
  parseJoinCode,
  publicItemViewSchema,
  slideItemConfigSchema,
  deckSecretSchema,
  responseSubmitSchema,
  type SlideItemConfig,
} from '../src';

const deckId = newUuid();

function mc(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: newUuid(),
    deckId,
    schemaVersion: 1,
    kind: 'question',
    type: 'multiple_choice',
    prompt: 'Wie geht es dir?',
    options: [
      { id: 'a', label: 'Gut' },
      { id: 'b', label: 'Schlecht' },
    ],
    ...overrides,
  };
}

describe('slideItemConfigSchema', () => {
  it('parses multiple choice and fills defaults', () => {
    const parsed: SlideItemConfig = slideItemConfigSchema.parse(mc());
    expect(parsed.kind).toBe('question');
    if (parsed.kind !== 'question' || parsed.type !== 'multiple_choice') throw new Error('narrowing');
    expect(parsed.allowMultiple).toBe(false);
    expect(parsed.resultsVisibility).toBe('live');
    expect(parsed.showOnPhone).toBe(false);
  });

  it('rejects too few options, duplicate ids, unknown correct option and empty prompt', () => {
    expect(slideItemConfigSchema.safeParse(mc({ options: [{ id: 'a', label: 'x' }] })).success).toBe(false);
    expect(
      slideItemConfigSchema.safeParse(
        mc({
          options: [
            { id: 'a', label: 'x' },
            { id: 'a', label: 'y' },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(slideItemConfigSchema.safeParse(mc({ correctOptionIds: ['zz'] })).success).toBe(false);
    expect(slideItemConfigSchema.safeParse(mc({ prompt: '   ' })).success).toBe(false);
    expect(slideItemConfigSchema.safeParse(mc({ maxSelections: 5 })).success).toBe(false);
  });

  it('parses every other kind and type', () => {
    const base = { id: newUuid(), deckId, schemaVersion: 1 };
    const cases: unknown[] = [
      { ...base, kind: 'question', type: 'word_cloud', prompt: 'Ein Wort' },
      { ...base, kind: 'question', type: 'open_text', prompt: 'Frage', entriesPerParticipant: 5 },
      { ...base, kind: 'question', type: 'scale', prompt: 'Skala', statements: [{ id: 's1', label: 'Aussage' }], range: 10 },
      {
        ...base,
        kind: 'question',
        type: 'quiz',
        prompt: 'Quiz',
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        correctOptionId: 'b',
      },
      { ...base, kind: 'leaderboard' },
      { ...base, kind: 'qa_wall' },
    ];
    for (const c of cases) expect(slideItemConfigSchema.safeParse(c).success).toBe(true);
  });

  it('rejects quiz without a valid correct option or with an odd time limit', () => {
    const quiz = {
      id: newUuid(),
      deckId,
      schemaVersion: 1,
      kind: 'question',
      type: 'quiz',
      prompt: 'Quiz',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      correctOptionId: 'c',
    };
    expect(slideItemConfigSchema.safeParse(quiz).success).toBe(false);
    expect(slideItemConfigSchema.safeParse({ ...quiz, correctOptionId: 'a', timeLimitSec: 25 }).success).toBe(false);
  });

  it('rejects word cloud with more than 3 entries and unknown kinds', () => {
    const base = { id: newUuid(), deckId, schemaVersion: 1 };
    expect(
      slideItemConfigSchema.safeParse({ ...base, kind: 'question', type: 'word_cloud', prompt: 'x', entriesPerParticipant: 4 })
        .success,
    ).toBe(false);
    expect(slideItemConfigSchema.safeParse({ ...base, kind: 'poll' }).success).toBe(false);
  });
});

describe('payloads', () => {
  it('validates submissions', () => {
    const ok = responseSubmitSchema.safeParse({
      itemId: newUuid(),
      clientResponseId: newUuid(),
      payload: { type: 'multiple_choice', optionIds: ['a'] },
    });
    expect(ok.success).toBe(true);
    const bad = responseSubmitSchema.safeParse({ itemId: 'x', clientResponseId: newUuid(), payload: { type: 'quiz' } });
    expect(bad.success).toBe(false);
  });

  it('public item view has no correct answer field before reveal by construction', () => {
    const shape = Object.keys(publicItemViewSchema.shape);
    expect(shape).toContain('correctOptionIds');
    expect(shape).not.toContain('correctOptionId');
  });
});

describe('ids and formatting', () => {
  it('generates valid secrets and ids', () => {
    expect(deckSecretSchema.safeParse(newDeckSecret()).success).toBe(true);
    expect(newShortId()).toMatch(/^[a-z0-9]{8}$/);
  });

  it('formats and parses join codes', () => {
    expect(formatJoinCode('482913')).toBe('482 913');
    expect(parseJoinCode('482 913')).toBe('482913');
    expect(parseJoinCode('https://pulse.example.at/482913')).toBe('482913');
    expect(parseJoinCode('https://pulse.example.at/482913?x=1')).toBe('482913');
    expect(parseJoinCode('48291')).toBeNull();
  });
});

describe('i18n', () => {
  it('has the same keys in every language', () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual(Object.keys(dictionaries.de).sort());
    for (const value of Object.values(dictionaries.en)) expect(value.length).toBeGreaterThan(0);
  });
});
