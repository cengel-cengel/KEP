import { describe, expect, it } from 'vitest';
import { TIER_OPTIONS, tierMeta } from './customerTier';

describe('tierMeta', () => {
  it('VIP → blue-600 / V', () => {
    const m = tierMeta('VIP');
    expect(m.label).toBe('VIP');
    expect(m.letter).toBe('V');
    expect(m.dotClass).toContain('blue-600');
  });
  it('A → blue-400', () => {
    expect(tierMeta('A').dotClass).toContain('blue-400');
  });
  it('B → gray-500', () => {
    expect(tierMeta('B').dotClass).toContain('gray-500');
  });
  it('C → gray-300', () => {
    expect(tierMeta('C').dotClass).toContain('gray-300');
  });
  it('null / unknown → Fallback "—"', () => {
    expect(tierMeta(null).label).toBe('—');
    expect(tierMeta(undefined).label).toBe('—');
    expect(tierMeta('XYZ').label).toBe('—');
  });
});

describe('TIER_OPTIONS', () => {
  it('5 Optionen (neutral + 4 Tiers), neutral als erstes', () => {
    expect(TIER_OPTIONS.length).toBe(5);
    expect(TIER_OPTIONS[0].value).toBe('');
    expect(TIER_OPTIONS.map((o) => o.value).slice(1)).toEqual([
      'VIP',
      'A',
      'B',
      'C',
    ]);
  });
});
