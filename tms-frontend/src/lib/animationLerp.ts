/**
 * B-1.1: Animation-Lerp-Helper für 3D-Box-Tweens.
 *
 * Per-Frame ease-out (exponential decay) — bei 60fps mit Faktor
 * 0.18 erreichen wir ~80% Distance in 8 Frames (~133ms), 95% in
 * ~16 Frames (~270ms) → fühlt sich wie 300ms ease-out an.
 *
 * Vorteil ggü. fixed-duration tween:
 *   - keine start/elapsed-Tracker je Box
 *   - smooth wenn target während Animation neu gesetzt
 *   - idempotent wenn mesh.position bereits == target
 */

/** Lerp-Faktor pro Frame (60fps ≈ 16.6ms). 0.18 ≈ ease-out 300ms. */
export const LERP_FACTOR_PER_FRAME = 0.18;

/** Distanz unter diesem Wert (cm in Three-Units = meters) → snap. */
export const SNAP_EPSILON = 0.001;

/**
 * Per-Frame-Lerp: bewegt current toward target.
 * Returns die nächste Position (auch wenn snap-to-target).
 */
export function lerpStep(
  current: number,
  target: number,
  factor: number = LERP_FACTOR_PER_FRAME,
): number {
  const diff = target - current;
  if (Math.abs(diff) < SNAP_EPSILON) return target;
  return current + diff * factor;
}

/** Detection: prefers-reduced-motion CSS Media-Query. SSR-safe. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
