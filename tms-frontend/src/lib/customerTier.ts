/**
 * M-1.1: Customer-Tier-Konstanten + Color-Mapping.
 *
 * Tier-Reihenfolge nach Priorität abnehmend:
 *   VIP > A > B > C (NULL = neutral, kein Score-Boost)
 *
 * Color-Scheme (Severity-Token-Variante, GO ALL DEFAULTS 3A):
 *   VIP  → blue-600   (höchste Prio, sticht hervor)
 *   A    → blue-400   (hoch)
 *   B    → gray-500   (mittel)
 *   C    → gray-300   (niedrig)
 *   null → gray-200   (neutral, kein Tier zugeordnet)
 */

export type CustomerTier = 'VIP' | 'A' | 'B' | 'C';

export interface TierMeta {
  label: string;
  /** Short-letter für Badge (V/A/B/C). */
  letter: string;
  /** Tailwind bg-class für Dot. */
  dotClass: string;
  /** Tailwind text-class für Label. */
  textClass: string;
}

const TIER_META: Record<CustomerTier, TierMeta> = {
  VIP: { label: 'VIP', letter: 'V', dotClass: 'bg-blue-600', textClass: 'text-blue-700' },
  A: { label: 'A', letter: 'A', dotClass: 'bg-blue-400', textClass: 'text-blue-600' },
  B: { label: 'B', letter: 'B', dotClass: 'bg-gray-500', textClass: 'text-gray-700' },
  C: { label: 'C', letter: 'C', dotClass: 'bg-gray-300', textClass: 'text-gray-500' },
};

const TIER_META_NULL: TierMeta = {
  label: '—',
  letter: '—',
  dotClass: 'bg-gray-200',
  textClass: 'text-gray-400',
};

/** Lookup mit Fallback für null/unknown. */
export function tierMeta(tier: string | null | undefined): TierMeta {
  if (tier && tier in TIER_META) return TIER_META[tier as CustomerTier];
  return TIER_META_NULL;
}

/** Options für InlineEdit type='select'. Erster Eintrag = neutral. */
export const TIER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '— neutral —' },
  { value: 'VIP', label: 'VIP' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
] as const;
