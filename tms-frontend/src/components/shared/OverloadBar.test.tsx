import { describe, expect, it } from 'vitest';
import { overloadParts } from './OverloadBar';

describe('overloadParts (O-3: Vol + Gewicht trigger; LDM ist INFO)', () => {
  it('leer wenn isOverloaded=false', () => {
    expect(
      overloadParts({ ldm: 0.5, weight: 0.5, vol: 0.5, isOverloaded: false }),
    ).toEqual([]);
  });
  it('leer bei null/undefined', () => {
    expect(overloadParts(null)).toEqual([]);
    expect(overloadParts(undefined)).toEqual([]);
  });
  it('O-3: ldm > 1 ALLEIN → keine Trigger-Parts (ldm ist INFO)', () => {
    // Konstruiert: BE wuerde diesen Fall nie als isOverloaded=true
    // liefern (ldm triggert nicht mehr), aber wir testen den Filter.
    expect(
      overloadParts({
        ldm: 1.15,
        weight: 0.5,
        vol: 0.5,
        isOverloaded: false,
      }),
    ).toEqual([]);
  });
  it('nur Gewicht wenn nur weight > 1', () => {
    expect(
      overloadParts({ ldm: 0.9, weight: 1.02, vol: 0.5, isOverloaded: true }),
    ).toEqual(['Gewicht 102%']);
  });
  it('nur Volumen wenn nur vol > 1', () => {
    expect(
      overloadParts({ ldm: 0.5, weight: 0.5, vol: 1.15, isOverloaded: true }),
    ).toEqual(['Volumen 115%']);
  });
  it('beide Trigger-Achsen wenn vol + weight > 1', () => {
    expect(
      overloadParts({ ldm: 1.15, weight: 1.02, vol: 1.08, isOverloaded: true }),
    ).toEqual(['Volumen 108%', 'Gewicht 102%']);
  });
  it('fehlendes vol-Feld (Legacy-Payload) → vol nicht im Banner', () => {
    expect(
      overloadParts({ ldm: 0.5, weight: 1.2, isOverloaded: true }),
    ).toEqual(['Gewicht 120%']);
  });
});
