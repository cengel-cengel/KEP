/**
 * Sprint Geo-Hof C2: kanonische Haversine-Implementation.
 *
 * Aus nv-touren/scheduler.lib.ts extrahiert. KEINE neue Formel —
 * 1:1 Move des dortigen haversineKm, damit Caller (scheduler.lib,
 * neue Cluster-Helper in poolShipments.lib, kuenftig auch andere)
 * eine Quelle teilen.
 *
 * Andere Kopien (nv-touren.service:3241, costs.service:31,
 * tourMatcher.lib:73, nv-subunternehmer.service:12,
 * subcontractors.service:12) bleiben in C2 BEWUSST unangetastet —
 * Konsolidierung ist Folge-Sprint (Risiko-Hebel: jede Stelle braucht
 * Smoke).
 */

const EARTH_R_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Haversine-Distanz in Kilometern zwischen zwei Geo-Punkten.
 * Erwartet Dezimalgrad (z.B. 48.7758, 9.1829 fuer Stuttgart).
 * Symmetrisch (a→b == b→a); positive Zahl >= 0.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
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
