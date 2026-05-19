import { describe, expect, it } from 'vitest';
import {
  getVehicleDims,
  resolveFahrzeugTyp,
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
    expect(getVehicleDims('  Jumbo  ').type).toBe('Jumbo');
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
