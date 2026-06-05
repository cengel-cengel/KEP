/**
 * Sprint Geo-Hof C2: Tests fuer haversineKm.
 *
 * Doppelfunktion:
 *  1. Verifiziert die Formel an Stuttgart-Region-Referenzpunkten.
 *  2. Sichert ab, dass die Extraktion aus scheduler.lib KEINE Werte-
 *     Drift erzeugt — gleiche Eingaben → gleiche Ausgaben.
 */
import { haversineKm } from './geo.lib';

describe('haversineKm', () => {
  it('symmetrisch: a→b === b→a', () => {
    const a = { lat: 48.7758, lng: 9.1829 }; // Stuttgart-Hbf
    const b = { lat: 49.0069, lng: 8.4037 }; // Karlsruhe
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });

  it('a===b → 0 km', () => {
    const a = { lat: 48.7758, lng: 9.1829 };
    expect(haversineKm(a, a)).toBeCloseTo(0, 9);
  });

  it('Stuttgart → Karlsruhe ≈ 64 km (Referenz)', () => {
    // Erwartung ±2 km — Haversine ohne Topographie.
    const stuttgart = { lat: 48.7758, lng: 9.1829 };
    const karlsruhe = { lat: 49.0069, lng: 8.4037 };
    const d = haversineKm(stuttgart, karlsruhe);
    expect(d).toBeGreaterThan(62);
    expect(d).toBeLessThan(66);
  });

  it('Stuttgart → Muenchen ≈ 192 km (Referenz)', () => {
    const stuttgart = { lat: 48.7758, lng: 9.1829 };
    const muenchen = { lat: 48.1351, lng: 11.582 };
    const d = haversineKm(stuttgart, muenchen);
    expect(d).toBeGreaterThan(188);
    expect(d).toBeLessThan(196);
  });

  it('1 Grad Latitude ≈ 111 km (Pol-aequivalente Referenz)', () => {
    const a = { lat: 48.0, lng: 9.0 };
    const b = { lat: 49.0, lng: 9.0 };
    const d = haversineKm(a, b);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('Drift-Check vs scheduler.lib alte Formel (identische Konstanten + Code)', () => {
    // Re-Implementiert die scheduler.lib-Formel manuell und vergleicht.
    // Sollte 100% bit-identisch sein (gleiche EARTH_R_KM=6371, gleiche
    // toRad-Helper). Wenn dieser Test bricht → Extraktion war NICHT
    // identisch → Werte-Drift im scheduler.
    const EARTH_R_KM = 6371;
    function legacyHaversine(
      a: { lat: number; lng: number },
      b: { lat: number; lng: number },
    ): number {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const sa =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) *
          Math.cos(toRad(b.lat)) *
          Math.sin(dLng / 2) ** 2;
      return 2 * EARTH_R_KM * Math.asin(Math.sqrt(sa));
    }
    const pairs: Array<[{ lat: number; lng: number }, { lat: number; lng: number }]> = [
      [{ lat: 48.7758, lng: 9.1829 }, { lat: 49.0069, lng: 8.4037 }],
      [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
      [{ lat: 48, lng: 9 }, { lat: -48, lng: -9 }],
      [{ lat: 90, lng: 0 }, { lat: -90, lng: 0 }],
    ];
    for (const [a, b] of pairs) {
      expect(haversineKm(a, b)).toBe(legacyHaversine(a, b));
    }
  });
});
