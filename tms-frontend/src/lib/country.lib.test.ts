import { describe, expect, it } from 'vitest';
import { codeToFlag, countryLabel } from './country.lib';

describe('country.lib', () => {
  it('codeToFlag: DE → 🇩🇪', () => {
    expect(codeToFlag('DE')).toBe('🇩🇪');
    expect(codeToFlag('fr')).toBe('🇫🇷');
  });
  it('codeToFlag: leer/ungültig → 🌐', () => {
    expect(codeToFlag('')).toBe('🌐');
    expect(codeToFlag(null)).toBe('🌐');
    expect(codeToFlag('D')).toBe('🌐');
    expect(codeToFlag('XYZ')).toBe('🌐');
    expect(codeToFlag('1A')).toBe('🌐');
  });
  it('countryLabel: bekannt → Flag + Name', () => {
    expect(countryLabel('DE')).toBe('🇩🇪 Deutschland');
    expect(countryLabel('FR')).toBe('🇫🇷 Frankreich');
  });
  it('countryLabel: unbekannter Code → Flag + Code', () => {
    expect(countryLabel('ZZ')).toBe('🇿🇿 ZZ');
  });
  it('countryLabel: leer → 🌐 Unbekannt', () => {
    expect(countryLabel(null)).toBe('🌐 Unbekannt');
    expect(countryLabel('')).toBe('🌐 Unbekannt');
  });
});
