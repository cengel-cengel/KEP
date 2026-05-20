/**
 * B-1.1: Animation-Lerp Helper Tests.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  LERP_FACTOR_PER_FRAME,
  SNAP_EPSILON,
  lerpStep,
  prefersReducedMotion,
} from './animationLerp';

describe('lerpStep', () => {
  it('bewegt current Richtung target (default-Faktor)', () => {
    const next = lerpStep(0, 10);
    expect(next).toBeCloseTo(10 * LERP_FACTOR_PER_FRAME, 5);
  });
  it('snap-to-target wenn diff < SNAP_EPSILON', () => {
    expect(lerpStep(5, 5 + SNAP_EPSILON / 2)).toBe(5 + SNAP_EPSILON / 2);
  });
  it('konvergiert idempotent bei current==target', () => {
    expect(lerpStep(7, 7)).toBe(7);
  });
  it('Custom-Faktor 0.5 → halbe Distanz pro Step', () => {
    expect(lerpStep(0, 10, 0.5)).toBeCloseTo(5, 5);
  });
  it('Negative Richtung funktioniert', () => {
    const next = lerpStep(10, 0);
    expect(next).toBeCloseTo(10 - 10 * LERP_FACTOR_PER_FRAME, 5);
    expect(next).toBeLessThan(10);
  });
  it('Multi-Step konvergiert binnen ~16 Frames in <5% Restdistance', () => {
    let cur = 0;
    const target = 100;
    for (let i = 0; i < 16; i++) cur = lerpStep(cur, target);
    expect(cur).toBeGreaterThan(95);
  });
});

describe('prefersReducedMotion', () => {
  beforeEach(() => {
    // matchMedia stub zurücksetzen.
    (window as any).matchMedia = undefined;
  });
  it('false wenn matchMedia nicht verfügbar', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
  it('respektiert media-query "matches"', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as any;
    expect(prefersReducedMotion()).toBe(true);
  });
  it('respektiert media-query nicht-matches', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any;
    expect(prefersReducedMotion()).toBe(false);
  });
});
