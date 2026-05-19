import { COUNTRY_CODE_OPTIONS } from './countryCodes';

const NAME_BY_CODE: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const o of COUNTRY_CODE_OPTIONS) m[o.value.toUpperCase()] = o.label;
  return m;
})();

/** ISO-2 → Unicode-Flag (🇩🇪 etc.) via regional indicator symbols. */
export function codeToFlag(cc?: string | null): string {
  if (!cc || cc.length !== 2) return '🌐';
  const base = 127397;
  const chars = cc.toUpperCase().split('');
  if (!/^[A-Z]{2}$/.test(chars.join(''))) return '🌐';
  return String.fromCodePoint(
    ...chars.map((c) => c.charCodeAt(0) + base),
  );
}

/** "🇩🇪 Deutschland" / "🌐 Unbekannt". */
export function countryLabel(cc?: string | null): string {
  if (!cc) return '🌐 Unbekannt';
  const flag = codeToFlag(cc);
  const name = NAME_BY_CODE[cc.toUpperCase()] ?? cc.toUpperCase();
  return `${flag} ${name}`;
}
