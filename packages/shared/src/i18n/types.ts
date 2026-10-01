import type { de } from './de';

export type MessageKey = keyof typeof de;
/** A complete dictionary: every key of the German reference, nothing else (§8). */
export type Dictionary = Readonly<Record<MessageKey, string>>;
