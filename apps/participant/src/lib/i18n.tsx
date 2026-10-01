import { STORAGE_KEYS, createTranslator, languageFromLocale, type Language, type Translate } from '@pulse/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storage } from './storage';

interface I18n {
  language: Language;
  t: Translate;
  setLanguage: (language: Language) => void;
}

const I18nContext = createContext<I18n | null>(null);

function initialLanguage(): Language {
  const saved = storage.get(STORAGE_KEYS.language);
  if (saved === 'de' || saved === 'en') return saved;
  return languageFromLocale(navigator.language);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const value = useMemo<I18n>(
    () => ({
      language,
      t: createTranslator(language),
      setLanguage: (next) => {
        storage.set(STORAGE_KEYS.language, next);
        setLanguageState(next);
      },
    }),
    [language],
  );
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('I18nProvider missing');
  return ctx;
}
