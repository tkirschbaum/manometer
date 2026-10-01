import type { Language } from './schemas';

/** "482913" -> "482 913" */
export function formatJoinCode(code: string): string {
  const digits = code.replace(/\D/g, '');
  return digits.length === 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

/** Extracts a 6-digit code from user input or a pasted link. */
export function parseJoinCode(input: string): string | null {
  const trimmed = input.trim();
  const fromPath = /\/(\d{3}\s?\d{3})(?:[/?#]|$)/.exec(trimmed);
  const candidate = fromPath?.[1] ?? trimmed;
  const digits = candidate.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function localeFor(language: Language): string {
  return language === 'de' ? 'de-AT' : 'en-GB';
}

export function formatNumber(value: number, language: Language, fractionDigits = 0): string {
  return new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercent(part: number, total: number, language: Language): string {
  const ratio = total > 0 ? part / total : 0;
  return new Intl.NumberFormat(localeFor(language), { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
}

/** Display host for the join strip: "pulse.example.at" from "https://pulse.example.at/". */
export function displayHost(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.port && url.port !== '443' ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return baseUrl;
  }
}
