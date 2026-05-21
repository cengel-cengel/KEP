/**
 * C1-B: Frontend Haversine + Coord-Order-Helper für Preview-
 * Polyline (gerade Linie zwischen Tour-Stops vor OSRM-Antwort).
 *
 * Returns Distanz in km zwischen zwei [lat, lng]-Punkten.
 */

const EARTH_R_KM = 6371;

export function haversineKm(
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

export interface PreviewRouteStop {
  lat: number;
  lng: number;
}

/**
 * Baut Preview-Polyline-Coords ([lat, lng]-Array) für eine
 * Tour. Tour-Typ-aware analog buildTourRoute (BE):
 *   isCharter=true  → [stops]
 *   isCharter=false → [warehouse, ...stops, warehouse]
 *
 * Wird verwendet wenn neuer Stop optimistisch hinzugefügt
 * wurde, aber OSRM noch nicht geantwortet hat.
 */
export function buildPreviewPolyline(args: {
  warehouse: PreviewRouteStop | null;
  stops: PreviewRouteStop[];
  isCharter: boolean;
}): Array<[number, number]> {
  const { warehouse, stops, isCharter } = args;
  if (stops.length === 0) return [];
  const coords: Array<[number, number]> = stops.map((s) => [s.lat, s.lng]);
  if (isCharter || !warehouse) return coords;
  return [
    [warehouse.lat, warehouse.lng],
    ...coords,
    [warehouse.lat, warehouse.lng],
  ];
}
