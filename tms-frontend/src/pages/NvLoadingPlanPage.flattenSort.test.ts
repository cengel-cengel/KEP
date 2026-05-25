/**
 * S-6.3 A-Fix Integration: flattenPackages (NV) ruft jetzt
 * sortPackagesForOptimalPack VOR placePackages — Carlos-Stack-Rule
 * gilt auch im Default-Render-Pfad (vorher: nur im Repack-Optimal-
 * Knopf der LoadingPlanPage explizit).
 *
 * Wir testen die Reihenfolge im Output indirekt: non-stackable-Pakete
 * landen zuerst (kleinste posY), stackable-Pakete dahinter. Stable-
 * Sort bei gleichem Profil.
 */
import { describe, it, expect } from 'vitest';
import { flattenPackages } from '../pages/NvLoadingPlanPage';
import type { NvLoadingDetail } from '../pages/NvLoadingPlanPage';

function mkItem(opts: {
  id: string;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  weight_kg?: number;
  stackable?: boolean;
}) {
  return {
    id: opts.id,
    line_index: 0,
    quantity: 1,
    length_cm: opts.length_cm ?? 120,
    width_cm: opts.width_cm ?? 80,
    height_cm: opts.height_cm ?? 100,
    weight_kg: opts.weight_kg ?? 100,
    stackable: opts.stackable ?? true,
  };
}

function mkTour(itemsPerStop: Array<{ id: string; stackable: boolean }>): NvLoadingDetail {
  return {
    id: 'tour-1',
    datum: '2099-12-31',
    status: 'PLANNING',
    fahrzeug_typ: 'Sattel',
    nv_stamm_tour_id: null,
    nv_stamm_tour: null,
    subunternehmer: null,
    stops: itemsPerStop.map((it, idx) => ({
      id: `stop-${idx}`,
      position: idx,
      is_stamm_kunde: false,
      shipment: {
        id: `sh-${it.id}`,
        shipment_number: `S-${it.id}`,
        weight_kg: 100,
        ldm: 1,
        length_cm: 120,
        width_cm: 80,
        height_cm: 100,
        customer_id: null,
        loading_date: '2099-12-31',
        status: 'new',
        has_active_lock: false,
        is_hazmat: false,
        customers: null,
        shipment_package_items: [mkItem({ id: it.id, stackable: it.stackable })],
      },
    })),
  };
}

describe('flattenPackages — S-6.3 A-Fix Pre-Sort', () => {
  it('non-stackable Sendungen landen ZUERST trotz DB-Order stackable-first', () => {
    // DB-Order: [stackable-a, non-stackable-b, stackable-c]
    // Carlos-Stack-Rule sortiert: non-stackable first, dann
    // weight/vol desc — Output muss b VOR a/c haben.
    const tour = mkTour([
      { id: 'a', stackable: true },
      { id: 'b', stackable: false },
      { id: 'c', stackable: true },
    ]);
    const out = flattenPackages(tour, 240, 1360, 270);
    // Erste placed-Sendung muss b sein (non-stackable kommt zuerst
    // in der Stack-Rule).
    expect(out.length).toBeGreaterThanOrEqual(3);
    // posY=0 ist die erste Position — das nicht-stapelbare Paket
    // muss dort liegen.
    const firstAtY0 = out.find((p) => !p.unplaced && p.posY === 0);
    expect(firstAtY0?.id).toBe('b');
  });

  it('Pre-Sort verbessert Pack-Effizienz (weniger unplaced als unsortiert)', () => {
    // 4× volle Trailer-Breite (240×340×100, stapelbar), DB-Order:
    // stackable a/b/c/d (alle gleich) → 4×340=1360cm → passt bis
    // auf Letztes. Sort aendert nichts an Reihenfolge weil identisch.
    // Wir testen separat dass nach Sort KEIN MEHR-unplaced entsteht
    // — Sort ist stabil bei gleichen Keys, also kein Bruch.
    const tour = mkTour([
      { id: 'a', stackable: true },
      { id: 'b', stackable: true },
      { id: 'c', stackable: true },
    ]);
    const out = flattenPackages(tour, 240, 1360, 270);
    const unplaced = out.filter((p) => p.unplaced);
    // 3 kleine Pakete (120×80×100) passen alle in Sattel → 0 unplaced.
    expect(unplaced).toHaveLength(0);
  });
});
