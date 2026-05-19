import { describe, expect, it } from 'vitest';
import { overloadParts } from './OverloadBar';

describe('overloadParts', () => {
  it('leer wenn isOverloaded=false', () => {
    expect(
      overloadParts({ ldm: 0.5, weight: 0.5, isOverloaded: false }),
    ).toEqual([]);
  });
  it('leer bei null/undefined', () => {
    expect(overloadParts(null)).toEqual([]);
    expect(overloadParts(undefined)).toEqual([]);
  });
  it('nur LDM wenn nur ldm > 1', () => {
    expect(
      overloadParts({ ldm: 1.15, weight: 0.5, isOverloaded: true }),
    ).toEqual(['LDM 115%']);
  });
  it('nur Gewicht wenn nur weight > 1', () => {
    expect(
      overloadParts({ ldm: 0.9, weight: 1.02, isOverloaded: true }),
    ).toEqual(['Gewicht 102%']);
  });
  it('beide Achsen wenn beide > 1', () => {
    expect(
      overloadParts({ ldm: 1.15, weight: 1.02, isOverloaded: true }),
    ).toEqual(['LDM 115%', 'Gewicht 102%']);
  });
});
