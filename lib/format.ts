/**
 * Formatierungs-Helfer für deutsches Locale.
 */

const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATETIME_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const CURRENCY_FORMAT = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const NUMBER_FORMAT = new Intl.NumberFormat('de-DE');

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return DATE_FORMAT.format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return DATETIME_FORMAT.format(d);
}

export function formatCurrency(value: number): string {
  return CURRENCY_FORMAT.format(value);
}

export function formatWeight(kg: number): string {
  return `${NUMBER_FORMAT.format(kg)} kg`;
}

export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

export function formatTrackingNumber(value: string): string {
  return value.toUpperCase().replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

/**
 * Locale-spezifische Datumsformatierung.
 * DE: DD.MM.YYYY, EN: MM/DD/YYYY (US-Style)
 */
export function formatDateForLocale(date: Date, locale: string): string {
  const tag = locale === 'en' ? 'en-US' : 'de-DE';
  return new Intl.DateTimeFormat(tag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
