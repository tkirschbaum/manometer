import { LIMITS, QUIZ_TIME_LIMITS, type DeckSettings, type Translate } from '@pulse/shared';
import type { ItemDraft } from '../model/schemas';
import { Button, Field, Segmented, Toggle, inputClass } from '../ui/controls';
import { OptionsEditor } from './OptionsEditor';

interface Props {
  draft: ItemDraft;
  onChange: (fn: (d: ItemDraft) => ItemDraft) => void;
  deckSettings: DeckSettings;
  onDeckSettings: (patch: Partial<DeckSettings>) => void;
  t: Translate;
}

/** Type-specific editor (§4.3, §6.8): compact single column that works from 480×270 px. */
export function ItemForm({ draft, onChange, deckSettings, onDeckSettings, t }: Props) {
  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]): void => {
    onChange((d) => ({ ...d, [key]: value }));
  };

  if (draft.kind === 'leaderboard') {
    return <p className="text-muted">{t('editor.leaderboardInfo')}</p>;
  }
  if (draft.kind === 'qa_wall') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted">{t('editor.qaWallInfo')}</p>
        {!deckSettings.qaEnabled ? (
          <Button
            variant="primary"
            className="self-start"
            onClick={() => {
              onDeckSettings({ qaEnabled: true });
            }}
          >
            {t('editor.qaWallEnable')}
          </Button>
        ) : null}
      </div>
    );
  }

  const optionsMax = draft.type === 'quiz' ? LIMITS.quizOptionsMax : LIMITS.mcOptionsMax;
  const filledOptions = draft.options.filter((o) => o.label.trim()).length;

  return (
    <div className="flex flex-col gap-4">
      <Field label={t('editor.prompt')} htmlFor="prompt">
        <textarea
          id="prompt"
          rows={2}
          value={draft.prompt}
          maxLength={LIMITS.promptMax}
          placeholder={t('editor.promptPlaceholder')}
          onChange={(e) => {
            set('prompt', e.target.value);
          }}
          className={`${inputClass} resize-none text-[16px] font-semibold`}
        />
      </Field>

      {draft.type === 'multiple_choice' || draft.type === 'quiz' ? (
        <Field label={t('editor.options')}>
          <OptionsEditor
            rows={draft.options}
            onChange={(rows) => {
              set('options', rows);
            }}
            min={2}
            max={optionsMax}
            maxLength={LIMITS.optionLabelMax}
            placeholderKey="editor.optionPlaceholder"
            addKey="editor.addOption"
            removeKey="editor.removeOption"
            t={t}
            correct={
              draft.type === 'quiz'
                ? {
                    mode: 'single',
                    ids: draft.quizCorrectOptionId ? [draft.quizCorrectOptionId] : [],
                    onChange: (ids) => {
                      set('quizCorrectOptionId', ids[0] ?? null);
                    },
                  }
                : {
                    mode: 'multi',
                    ids: draft.correctOptionIds,
                    onChange: (ids) => {
                      set('correctOptionIds', ids);
                    },
                  }
            }
          />
        </Field>
      ) : null}

      {draft.type === 'multiple_choice' ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Toggle
            id="allow-multiple"
            checked={draft.allowMultiple}
            onChange={(v) => {
              set('allowMultiple', v);
            }}
            label={t('editor.allowMultiple')}
          />
          {draft.allowMultiple ? (
            <label className="flex items-center gap-2">
              {t('editor.maxSelections')}
              <select
                value={draft.maxSelections ?? Math.max(2, filledOptions)}
                onChange={(e) => {
                  set('maxSelections', Number(e.target.value));
                }}
                className={`${inputClass} w-16`}
              >
                {Array.from({ length: Math.max(1, Math.max(2, filledOptions) - 1) }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {draft.type === 'word_cloud' ? (
        <Field label={t('editor.entriesPerParticipant')}>
          <Segmented
            label={t('editor.entriesPerParticipant')}
            value={draft.wordEntries}
            options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
            onChange={(v) => {
              set('wordEntries', v);
            }}
          />
        </Field>
      ) : null}

      {draft.type === 'open_text' ? (
        <Field label={t('editor.entriesPerParticipant')}>
          <Segmented
            label={t('editor.entriesPerParticipant')}
            value={draft.textEntries}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            onChange={(v) => {
              set('textEntries', v);
            }}
          />
        </Field>
      ) : null}

      {draft.type === 'scale' ? (
        <>
          <Field label={t('editor.statements')}>
            <OptionsEditor
              rows={draft.statements}
              onChange={(rows) => {
                set('statements', rows);
              }}
              min={1}
              max={LIMITS.statementsMax}
              maxLength={LIMITS.statementLabelMax}
              placeholderKey="editor.statementPlaceholder"
              addKey="editor.addStatement"
              removeKey="editor.removeStatement"
              t={t}
            />
          </Field>
          <Field label={t('editor.range')}>
            <Segmented
              label={t('editor.range')}
              value={draft.range}
              options={[5, 10].map((n) => ({ value: n as 5 | 10, label: t('editor.rangeOption', { n }) }))}
              onChange={(v) => {
                set('range', v);
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('editor.minLabel')} htmlFor="min-label">
              <input
                id="min-label"
                value={draft.minLabel}
                maxLength={LIMITS.scaleLabelMax}
                placeholder={t('editor.minLabelPlaceholder')}
                onChange={(e) => {
                  set('minLabel', e.target.value);
                }}
                className={inputClass}
              />
            </Field>
            <Field label={t('editor.maxLabel')} htmlFor="max-label">
              <input
                id="max-label"
                value={draft.maxLabel}
                maxLength={LIMITS.scaleLabelMax}
                placeholder={t('editor.maxLabelPlaceholder')}
                onChange={(e) => {
                  set('maxLabel', e.target.value);
                }}
                className={inputClass}
              />
            </Field>
          </div>
        </>
      ) : null}

      {draft.type === 'quiz' ? (
        <>
          <Field label={t('editor.timeLimit')}>
            <Segmented
              label={t('editor.timeLimit')}
              value={draft.timeLimitSec}
              options={QUIZ_TIME_LIMITS.map((n) => ({ value: n, label: t('editor.seconds', { n }) }))}
              onChange={(v) => {
                set('timeLimitSec', v);
              }}
            />
          </Field>
          <Field label={t('editor.startMode')}>
            <Segmented
              label={t('editor.startMode')}
              value={draft.startMode}
              options={[
                { value: 'auto' as const, label: t('editor.startMode.auto') },
                { value: 'click' as const, label: t('editor.startMode.click') },
              ]}
              onChange={(v) => {
                set('startMode', v);
              }}
            />
          </Field>
        </>
      ) : null}

      {draft.type === 'multiple_choice' ? (
        <Field label={t('editor.results')}>
          <Segmented
            label={t('editor.results')}
            value={draft.resultsVisibility}
            options={[
              { value: 'live' as const, label: t('editor.results.live') },
              { value: 'on_reveal' as const, label: t('editor.results.on_reveal') },
            ]}
            onChange={(v) => {
              set('resultsVisibility', v);
            }}
          />
        </Field>
      ) : null}

      {draft.type !== 'quiz' ? (
        <Toggle
          id="show-on-phone"
          checked={draft.showOnPhone}
          onChange={(v) => {
            set('showOnPhone', v);
          }}
          label={t('editor.showOnPhone')}
        />
      ) : null}
    </div>
  );
}
