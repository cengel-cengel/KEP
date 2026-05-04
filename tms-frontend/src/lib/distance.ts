/**
 * Haversine: Luftlinie zwischen zwei Punkten in Kilometern.
 * Earth-Radius 6371 km.
 */
const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function isWithinKm(
  coord: [number, number],
  points: Array<[number, number]>,
  maxKm: number,
): boolean {
  for (const p of points) {
    if (haversineKm(coord[0], coord[1], p[0], p[1]) <= maxKm) return true;
  }
  return false;
}
