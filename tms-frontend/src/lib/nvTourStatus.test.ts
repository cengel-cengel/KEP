import { describe, expect, it } from 'vitest';
import {
  nvStatusLabel,
  nvStatusBadgeClass,
  NV_TOUR_STATUS_FILTER,
} from './nvTourStatus';

describe('nvStatusLabel', () => {
  it('PLANNING → "Geplant" unabhängig vom Mode', () => {
    expect(nvStatusLabel('PLANNING', 'PICKUP')).toBe('Geplant');
    expect(nvStatusLabel('PLANNING', 'DELIVERY')).toBe('Geplant');
    expect(nvStatusLabel('PLANNING', undefined)).toBe('Geplant');
  });
  it('PICKUP IN_PROGRESS → "In Abholung"', () => {
    expect(nvStatusLabel('IN_PROGRESS', 'PICKUP')).toBe('In Abholung');
  });
  it('PICKUP COMPLETED → "Abgeholt"', () => {
    expect(nvStatusLabel('COMPLETED', 'PICKUP')).toBe('Abgeholt');
  });
  it('DELIVERY IN_PROGRESS → "In Zustellung"', () => {
    expect(nvStatusLabel('IN_PROGRESS', 'DELIVERY')).toBe('In Zustellung');
  });
  it('DELIVERY COMPLETED → "Zugestellt"', () => {
    expect(nvStatusLabel('COMPLETED', 'DELIVERY')).toBe('Zugestellt');
  });
  it('CANCELLED → "Storniert" unabhängig vom Mode', () => {
    expect(nvStatusLabel('CANCELLED', 'PICKUP')).toBe('Storniert');
    expect(nvStatusLabel('CANCELLED', 'DELIVERY')).toBe('Storniert');
  });
  it('mode=undefined fällt zurück auf PICKUP-Labels', () => {
    expect(nvStatusLabel('IN_PROGRESS', undefined)).toBe('In Abholung');
    expect(nvStatusLabel('COMPLETED', undefined)).toBe('Abgeholt');
  });
  it('unbekannter Status → raw Wert', () => {
    expect(nvStatusLabel('FOO', 'PICKUP')).toBe('FOO');
  });
});

describe('nvStatusBadgeClass', () => {
  it('jeder Status eine eigene Klasse', () => {
    const all = new Set([
      nvStatusBadgeClass('PLANNING'),
      nvStatusBadgeClass('IN_PROGRESS'),
      nvStatusBadgeClass('COMPLETED'),
      nvStatusBadgeClass('CANCELLED'),
    ]);
    expect(all.size).toBe(4);
  });
});

describe('NV_TOUR_STATUS_FILTER', () => {
  it('enthält genau die 3 Workflow-States, NICHT CANCELLED', () => {
    expect(NV_TOUR_STATUS_FILTER).toEqual([
      'PLANNING',
      'IN_PROGRESS',
      'COMPLETED',
    ]);
  });
});
