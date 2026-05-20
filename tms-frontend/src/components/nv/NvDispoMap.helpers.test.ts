/**
 * S-7 Helper-Tests (Pure-funktionen aus NvDispoMap).
 * Voll-Map kann jsdom nicht (Leaflet braucht real DOM).
 */
import { describe, expect, it } from 'vitest';
import { polylineColorForStatus } from './NvDispoMap';

describe('polylineColorForStatus', () => {
  it('PLANNING → slate-500', () => {
    expect(polylineColorForStatus('PLANNING')).toBe('#64748b');
  });
  it('IN_PROGRESS → blue-500', () => {
    expect(polylineColorForStatus('IN_PROGRESS')).toBe('#3b82f6');
  });
  it('COMPLETED → green-500', () => {
    expect(polylineColorForStatus('COMPLETED')).toBe('#10b981');
  });
  it('LATE → red-500', () => {
    expect(polylineColorForStatus('LATE')).toBe('#ef4444');
  });
  it('CANCELLED → gray-400', () => {
    expect(polylineColorForStatus('CANCELLED')).toBe('#9ca3af');
  });
  it('null / unknown → slate-500 Fallback', () => {
    expect(polylineColorForStatus(null)).toBe('#64748b');
    expect(polylineColorForStatus(undefined)).toBe('#64748b');
    expect(polylineColorForStatus('XYZ')).toBe('#64748b');
  });
});
