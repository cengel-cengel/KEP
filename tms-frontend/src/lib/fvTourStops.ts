/**
 * Baut TourStopPin[] für die FV-Map aus einer Tour-Detail-Payload.
 *
 *   Position 0: hub_start (isWarehouse)
 *   Position 1..N: shipments sortiert nach tour_position
 *   Position N+1: hub_end (isWarehouse)
 *
 * "ohne Hub" → Pin weglassen. Stops ohne Geo-Koords übersprungen.
 */

export interface FvAddressLite {
  id?: string;
  name?: string | null;
  zip?: string | null;
  city?: string | null;
  lat?: string | number | null;
  lng?: string | number | null;
}

export interface FvTourShipmentLite {
  id: string;
  shipment_number?: string | null;
  tour_position?: number | null;
  addresses_shipments_loading_address_idToaddresses?: FvAddressLite | null;
}

export interface FvTourDetailLite {
  id: string;
  hub_start_address?: FvAddressLite | null;
  hub_end_address?: FvAddressLite | null;
  shipments?: FvTourShipmentLite[];
}

export interface FvTourStopPin {
  id: string;
  position: number;
  shipment_number?: string;
  lat: number;
  lng: number;
  isWarehouse?: boolean;
  label?: string;
}

function fmtAddrLabel(a?: FvAddressLite | null): string {
  if (!a) return '';
  const parts = [a.zip, a.city].filter(Boolean).join(' ');
  return parts || a.name || '';
}

function toCoord(a?: FvAddressLite | null): { lat: number; lng: number } | null {
  if (!a) return null;
  const lat = Number(a.lat);
  const lng = Number(a.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export function buildFvTourStops(
  tour: FvTourDetailLite | null | undefined,
): FvTourStopPin[] {
  if (!tour) return [];
  const out: FvTourStopPin[] = [];

  const startCoord = toCoord(tour.hub_start_address);
  if (startCoord) {
    out.push({
      id: `__hub_start__${tour.id}`,
      position: 0,
      lat: startCoord.lat,
      lng: startCoord.lng,
      isWarehouse: true,
      label: `Start · ${fmtAddrLabel(tour.hub_start_address) || 'Hub'}`,
    });
  }

  const ships = [...(tour.shipments ?? [])].sort((a, b) => {
    const ap = a.tour_position ?? 999999;
    const bp = b.tour_position ?? 999999;
    return ap - bp;
  });
  let pos = 1;
  for (const s of ships) {
    const c = toCoord(s.addresses_shipments_loading_address_idToaddresses);
    if (!c) continue;
    out.push({
      id: s.id,
      position: pos++,
      shipment_number: s.shipment_number ?? undefined,
      lat: c.lat,
      lng: c.lng,
    });
  }

  const endCoord = toCoord(tour.hub_end_address);
  if (endCoord) {
    out.push({
      id: `__hub_end__${tour.id}`,
      position: pos,
      lat: endCoord.lat,
      lng: endCoord.lng,
      isWarehouse: true,
      label: `Ende · ${fmtAddrLabel(tour.hub_end_address) || 'Hub'}`,
    });
  }
  return out;
}
