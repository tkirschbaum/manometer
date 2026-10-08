import { LIMITS, type DeckSettings, type Translate } from '@pulse/shared';
import { Button, Field, Segmented, Toggle, inputClass } from '../ui/controls';
import { QuizNamesField } from './ItemForm';

/** Session settings (§4.3 deck-level settings): inline, never a modal (§6.8). */
export function SettingsPanel({
  settings,
  onChange,
  onClose,
  t,
}: {
  settings: DeckSettings;
  onChange: (patch: Partial<DeckSettings>) => void;
  onClose: () => void;
  t: Translate;
}) {
  return (
    <section aria-labelledby="settings-title" className="flex flex-col gap-3 rounded-brand border border-line p-3">
      <h2 id="settings-title" className="font-bold text-ink">
        {t('editor.settings.title')}
      </h2>
      <Field label={t('editor.settings.deckTitle')} htmlFor="deck-title">
        <input
          id="deck-title"
          value={settings.title}
          maxLength={LIMITS.titleMax}
          onChange={(e) => {
            onChange({ title: e.target.value });
          }}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Field label={t('editor.settings.slideLanguage')}>
          <Segmented
            label={t('editor.settings.slideLanguage')}
            value={settings.slideLanguage}
            options={[
              { value: 'de' as const, label: t('lang.de') },
              { value: 'en' as const, label: t('lang.en') },
            ]}
            onChange={(v) => {
              onChange({ slideLanguage: v });
            }}
          />
        </Field>
        <Field label={t('editor.settings.theme')}>
          <Segmented
            label={t('editor.settings.theme')}
            value={settings.theme}
            options={[
              { value: 'light' as const, label: t('theme.light') },
              { value: 'dark' as const, label: t('theme.dark') },
            ]}
            onChange={(v) => {
              onChange({ theme: v });
            }}
          />
        </Field>
      </div>
      <Toggle
        id="qa-enabled"
        checked={settings.qaEnabled}
        onChange={(v) => {
          onChange({ qaEnabled: v });
        }}
        label={t('editor.settings.qa')}
      />
      <Toggle
        id="show-qr"
        checked={settings.showQr}
        onChange={(v) => {
          onChange({ showQr: v });
        }}
        label={t('editor.settings.qr')}
      />
      <QuizNamesField
        value={settings.quizNames}
        onChange={(v) => {
          onChange({ quizNames: v });
        }}
        t={t}
        label={t('editor.settings.quizNames')}
      />
      <Button variant="primary" className="self-start" onClick={onClose}>
        {t('common.done')}
      </Button>
    </section>
  );
}
