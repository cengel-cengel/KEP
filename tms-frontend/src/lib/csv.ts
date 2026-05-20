/**
 * C' Sprint: CSV-Export-Helper.
 *
 * DE-Locale (default):
 *   delim=';'  decimal=','
 *   (Excel-DE öffnet ';' direkt als Spalten — ',' nur in en-US-Locale.)
 *
 * RFC 4180-konforme Cell-Quoting wenn Wert delim, " oder Newline enthält.
 */

export interface CsvOptions {
  /** Cell-Separator. Default ';' (DE-Locale). */
  delim?: string;
  /** Dezimal-Separator für Number-Inputs. Default ',' (DE). */
  decimal?: string;
  /** Newline. Default CRLF (Excel-kompatibel). */
  newline?: string;
}

const DEFAULTS: Required<CsvOptions> = {
  delim: ';',
  decimal: ',',
  newline: '\r\n',
};

function escapeCell(raw: string, delim: string): string {
  const needsQuote =
    raw.includes(delim) || raw.includes('"') || raw.includes('\n') || raw.includes('\r');
  if (!needsQuote) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

/** Konvertiert beliebigen Wert in CSV-Cell-String (number → decimal-locale). */
export function cellValue(
  v: string | number | null | undefined,
  decimal: string,
): string {
  if (v == null) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    const s = String(v);
    return decimal === '.' ? s : s.replace('.', decimal);
  }
  return v;
}

/**
 * Wandelt 2D-Array von Werten in CSV-Text.
 * Header-Row als rows[0] inkludieren.
 */
export function toCSV(
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
  opts: CsvOptions = {},
): string {
  const { delim, decimal, newline } = { ...DEFAULTS, ...opts };
  return rows
    .map((row) =>
      row.map((cell) => escapeCell(cellValue(cell, decimal), delim)).join(delim),
    )
    .join(newline);
}

/**
 * Triggert Browser-Download. UTF-8 mit BOM (Excel-DE-kompatibel —
 * sonst Umlaut-Mojibake).
 */
export function downloadCSV(filename: string, content: string): void {
  if (typeof window === 'undefined') return;
  const bom = '﻿';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
