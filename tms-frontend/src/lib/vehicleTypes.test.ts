import { describe, expect, it, vi } from 'vitest';
import {
  getVehicleDims,
  resolveFahrzeugTyp,
  resolveVehicleCapacity,
  VEHICLE_DEFAULT_TYPE,
} from './vehicleTypes';

describe('getVehicleDims', () => {
  it('bekannter Typ exakt → match', () => {
    const v = getVehicleDims('Koffer 12t');
    expect(v.type).toBe('Koffer 12t');
    expect(v.lengthCm).toBe(740);
  });
  it('case-insensitive', () => {
    expect(getVehicleDims('SPRINTER').type).toBe('Sprinter');
    expect(getVehicleDims('sattel').type).toBe('Sattel');
    expect(getVehicleDims('  Sattel  ').type).toBe('Sattel');
  });
  it('unbekannter Typ → Default Koffer 7t', () => {
    expect(getVehicleDims('Bullshit-Vehicle').type).toBe('Koffer 7t');
    expect(getVehicleDims('Spritner-typo').type).toBe('Koffer 7t');
  });
  it('null/undefined/empty → Default', () => {
    expect(getVehicleDims(null).type).toBe('Koffer 7t');
    expect(getVehicleDims(undefined).type).toBe('Koffer 7t');
    expect(getVehicleDims('').type).toBe('Koffer 7t');
    expect(getVehicleDims('   ').type).toBe('Koffer 7t');
  });
});

describe('resolveVehicleCapacity — T1 Kapazität pro Typ', () => {
  it('Sattel canonical → 88 m³ / 24000 kg / 13.6 ldm', () => {
    const c = resolveVehicleCapacity({ fahrzeug_typ: 'Sattel' }, null);
    expect(c.source).toBe('vehicle-dims');
    expect(c.maxLdm).toBe(13.6);
    expect(c.maxWeightKg).toBe(24000);
    expect(c.maxVolM3).toBeCloseTo(88.13, 1);
    expect(c.lengthCm).toBe(1360);
    expect(c.widthCm).toBe(240);
    expect(c.heightCm).toBe(270);
  });
  it('7_5T Tonnen → 40 m³ / 3000 kg / 8 ldm (Nutzlast)', () => {
    const c = resolveVehicleCapacity({ fahrzeug_typ: '7_5T' }, null);
    expect(c.source).toBe('tonnen');
    expect(c.maxLdm).toBeCloseTo(8.0, 1);
    expect(c.maxWeightKg).toBe(3000);
    expect(c.maxVolM3).toBeCloseTo(40, 0);
  });
  it('12T Tonnen → 50 m³ / 6000 kg / 8.7 ldm (Nutzlast, T1-Update)', () => {
    const c = resolveVehicleCapacity({ fahrzeug_typ: '12T' }, null);
    expect(c.source).toBe('tonnen');
    expect(c.maxLdm).toBeCloseTo(8.7, 1);
    expect(c.maxWeightKg).toBe(6000);
    expect(c.maxVolM3).toBeCloseTo(50, 0);
  });
  it('18T Tonnen → 60 m³ / 10000 kg / 10.4 ldm (Nutzlast, T1-Update)', () => {
    const c = resolveVehicleCapacity({ fahrzeug_typ: '18T' }, null);
    expect(c.source).toBe('tonnen');
    expect(c.maxLdm).toBeCloseTo(10.4, 1);
    expect(c.maxWeightKg).toBe(10000);
    expect(c.maxVolM3).toBeCloseTo(60, 0);
  });
  it('Sub-Stammdaten override > Tonnen > VEHICLE_DIMS', () => {
    // sub.max_ldm präsent → source='sub'
    const c = resolveVehicleCapacity(
      { fahrzeug_typ: 'Sattel' },
      { max_ldm: 7.5, max_gewicht_kg: 2800 },
    );
    expect(c.source).toBe('sub');
    expect(c.maxLdm).toBe(7.5);
    expect(c.maxWeightKg).toBe(2800);
    // canonicalDims (Sattel) hat Vorrang vor deriveBoxFromLdm wenn
    // tour/sub einen canonical-Match liefern → 1360×240×270.
    expect(c.lengthCm).toBe(1360);
    expect(c.maxVolM3).toBeCloseTo(88.13, 1);
  });
  it('Unknown typ → fallback Koffer 7t mit maxVolM3', () => {
    // Suppress expected console.warn — fallback signalisiert
    // unvollstaendige Stammdaten und loggt via console.warn.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = resolveVehicleCapacity(
      { fahrzeug_typ: 'Bullshit' },
      { max_ldm: null, max_gewicht_kg: null, fahrzeug_typ: 'AlsoBullshit' },
    );
    expect(c.source).toBe('fallback-unknown');
    expect(c.maxLdm).toBe(6);
    expect(c.maxVolM3).toBeCloseTo(35.7, 1); // 620×240×240/1e6
    warnSpy.mockRestore();
  });
});

describe('resolveFahrzeugTyp', () => {
  it('tour-override hat Vorrang', () => {
    expect(resolveFahrzeugTyp('Sattel', 'Sprinter')).toBe('Sattel');
  });
  it('sub-default wenn tour leer', () => {
    expect(resolveFahrzeugTyp(null, 'Sprinter')).toBe('Sprinter');
    expect(resolveFahrzeugTyp('', 'Sprinter')).toBe('Sprinter');
    expect(resolveFahrzeugTyp('  ', 'Sprinter')).toBe('Sprinter');
  });
  it('Default-Fallback wenn beide leer', () => {
    expect(resolveFahrzeugTyp(null, null)).toBe(VEHICLE_DEFAULT_TYPE);
    expect(resolveFahrzeugTyp('', '')).toBe(VEHICLE_DEFAULT_TYPE);
    expect(resolveFahrzeugTyp(undefined, undefined)).toBe(
      VEHICLE_DEFAULT_TYPE,
    );
  });
});
