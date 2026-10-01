import type { Language } from '../schemas';
import { de } from './de';
import { en } from './en';
import type { Dictionary, MessageKey } from './types';

export type { Dictionary, MessageKey } from './types';

export const dictionaries: Record<Language, Dictionary> = { de, en };

export type TranslateVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: TranslateVars) => string;

export function translate(dict: Dictionary, key: MessageKey, vars?: TranslateVars): string {
  const template = dict[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(language: Language): Translate {
  const dict = dictionaries[language];
  return (key, vars) => translate(dict, key, vars);
}

type PluralBase<K extends string> = K extends `${infer B}.one` ? B : never;
export type PluralKey = PluralBase<MessageKey>;

/** Picks "{base}.one" or "{base}.other" and fills {n}. */
export function plural(t: Translate, base: PluralKey, n: number, formatted?: string): string {
  const key = (n === 1 ? `${base}.one` : `${base}.other`) as MessageKey;
  return t(key, { n: formatted ?? n });
}

/** "de-AT" -> "de", anything else -> "en" (§6.8, §7.3). */
export function languageFromLocale(locale: string | undefined | null): Language {
  return locale?.toLowerCase().startsWith('de') ? 'de' : 'en';
}
