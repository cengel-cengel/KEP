import { describe, expect, it } from 'vitest';
import { buildFvHierarchy, UNKNOWN_CC } from './useFvHierarchy';

type S = { id: string; loading_address?: any; delivery_address?: any };

const mk = (
  id: string,
  lc: string | null,
  dc: string | null,
): S => ({
  id,
  loading_address: { country_code: lc },
  delivery_address: { country_code: dc },
});

describe('buildFvHierarchy', () => {
  it('leerer Input → leerer Tree', () => {
    expect(buildFvHierarchy([])).toEqual([]);
  });

  it('gruppiert nach loading/delivery country', () => {
    const ships = [
      mk('1', 'DE', 'FR'),
      mk('2', 'DE', 'FR'),
      mk('3', 'DE', 'IT'),
      mk('4', 'NL', 'DE'),
      mk('5', 'NL', 'DE'),
    ];
    const tree = buildFvHierarchy(ships);
    expect(tree).toHaveLength(2);
    expect(tree[0].loadingCountry).toBe('DE');
    expect(tree[0].count).toBe(3);
    expect(tree[0].deliveryGroups.map((d) => d.deliveryCountry)).toEqual([
      'FR',
      'IT',
    ]);
    expect(tree[0].deliveryGroups[0].shipments.map((s) => s.id)).toEqual([
      '1',
      '2',
    ]);
    expect(tree[1].loadingCountry).toBe('NL');
    expect(tree[1].count).toBe(2);
  });

  it('null/empty country → UNKNOWN, ans Ende sortiert', () => {
    const ships = [
      mk('1', 'DE', 'FR'),
      mk('2', null, 'FR'),
      mk('3', 'DE', null),
    ];
    const tree = buildFvHierarchy(ships);
    expect(tree.map((c) => c.loadingCountry)).toEqual(['DE', UNKNOWN_CC]);
    const de = tree[0];
    expect(de.deliveryGroups.map((d) => d.deliveryCountry)).toEqual([
      'FR',
      UNKNOWN_CC,
    ]);
  });

  it('case-insensitive normalize', () => {
    const tree = buildFvHierarchy([
      mk('1', 'de', 'fr'),
      mk('2', 'DE', 'FR'),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].loadingCountry).toBe('DE');
    expect(tree[0].deliveryGroups[0].deliveryCountry).toBe('FR');
    expect(tree[0].count).toBe(2);
  });
});
