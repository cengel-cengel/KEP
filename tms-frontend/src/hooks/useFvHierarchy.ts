import { useMemo } from 'react';

export interface FvHierarchyShipment {
  id: string;
  loading_address?: { country_code?: string | null } | null;
  delivery_address?: { country_code?: string | null } | null;
}

export interface RelationGroup<S> {
  /** Delivery-Country-Code (ggf. UNKNOWN). */
  deliveryCountry: string;
  shipments: S[];
}

export interface CountryGroup<S> {
  /** Loading-Country-Code (ggf. UNKNOWN). */
  loadingCountry: string;
  count: number;
  deliveryGroups: RelationGroup<S>[];
}

export const UNKNOWN_CC = 'UNKNOWN';

function normCc(cc?: string | null): string {
  const v = (cc ?? '').trim().toUpperCase();
  return v || UNKNOWN_CC;
}

/** Stabile Sortierung: UNKNOWN immer ans Ende, sonst alpha. */
function ccSort(a: string, b: string): number {
  if (a === UNKNOWN_CC && b !== UNKNOWN_CC) return 1;
  if (b === UNKNOWN_CC && a !== UNKNOWN_CC) return -1;
  return a.localeCompare(b);
}

export function buildFvHierarchy<S extends FvHierarchyShipment>(
  shipments: S[],
): CountryGroup<S>[] {
  const byLoading = new Map<string, Map<string, S[]>>();
  for (const s of shipments) {
    const lc = normCc(s.loading_address?.country_code);
    const dc = normCc(s.delivery_address?.country_code);
    let inner = byLoading.get(lc);
    if (!inner) {
      inner = new Map();
      byLoading.set(lc, inner);
    }
    let list = inner.get(dc);
    if (!list) {
      list = [];
      inner.set(dc, list);
    }
    list.push(s);
  }
  const result: CountryGroup<S>[] = [];
  const lcs = [...byLoading.keys()].sort(ccSort);
  for (const lc of lcs) {
    const inner = byLoading.get(lc)!;
    const dcs = [...inner.keys()].sort(ccSort);
    let count = 0;
    const deliveryGroups: RelationGroup<S>[] = dcs.map((dc) => {
      const ships = inner.get(dc)!;
      count += ships.length;
      return { deliveryCountry: dc, shipments: ships };
    });
    result.push({ loadingCountry: lc, count, deliveryGroups });
  }
  return result;
}

export function useFvHierarchy<S extends FvHierarchyShipment>(
  shipments: S[],
): CountryGroup<S>[] {
  return useMemo(() => buildFvHierarchy(shipments), [shipments]);
}
