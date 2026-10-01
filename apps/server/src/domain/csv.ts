/**
 * CSV for German Excel (§5.7): UTF-8 with BOM, semicolon delimiter, CRLF line endings.
 * Cells starting with = + - @ (or a tab/CR) are prefixed with an apostrophe so participant text can never
 * run as a formula when the file is opened in Excel (CSV injection).
 */
const BOM = '﻿';

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[;"\r\n]/.test(text) || /^\s|\s$/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: readonly (readonly (string | number | boolean | null | undefined)[])[]): string {
  return BOM + rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
