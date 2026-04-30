export const TRANSPORT_TYPE_OPTIONS = [
  { value: 'SAMMELGUT',         label: 'Sammelgut' },
  { value: 'DIREKT',            label: 'Charter / Direktverkehr' },
  { value: 'DIREKT_UMSCHLAG',   label: 'Direkt mit Umschlag' },
  { value: 'ABHOLUNG_UMSCHLAG', label: 'Sammelguteingang' },
  { value: 'BEILADER',          label: 'Beilader' },
  { value: 'SONDER',            label: 'Sonderfahrt' },
  { value: 'SELBST',            label: 'Selbstabholer' },
] as const;

export type TransportType = (typeof TRANSPORT_TYPE_OPTIONS)[number]['value'];

export const TRANSPORT_TYPE_DEFAULT: TransportType = 'SAMMELGUT';

export function transportTypeLabel(value?: string | null): string {
  if (!value) return '–';
  return TRANSPORT_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
