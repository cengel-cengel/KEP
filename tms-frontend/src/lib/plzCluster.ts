/**
 * PLZ-Cluster-Helper (T3 Hof-Spec, geteilt zwischen YardPanel und
 * NvLoadingPlanHofPanel).
 *
 * const PLZ_CLUSTER_DIGITS = 3:
 *   3 = "704xx" (~13 km Radius pro Cluster, gut für Hof-Bündelung)
 *   Justierbar; spätere UI-Slider geplant.
 *
 * plzPrefix(zip, digits) → die ersten N Ziffern + Rest mit 'x'
 *   gefüllt (5-stellig). z.B.:
 *     plzPrefix("70435", 3) → "704xx"
 *     plzPrefix("70435", 5) → "70435"
 *     plzPrefix(null, 3)    → "—"
 *   Defensive: nicht-numerische PLZ werden auch geclustert (z.B.
 *   1010 AT → "101xx").
 */

export const PLZ_CLUSTER_DIGITS = 3;

export function plzPrefix(
  zip: string | null | undefined,
  digits: number = PLZ_CLUSTER_DIGITS,
): string {
  if (!zip) return '—';
  const trimmed = zip.trim();
  if (!trimmed) return '—';
  const head = trimmed.slice(0, digits);
  const padLen = Math.max(0, 5 - head.length);
  return head + 'x'.repeat(padLen);
}
