/**
 * W-3.2.A: Shared NV-Dispo-Types + Helpers.
 * Extrahiert aus NvDispositionPage.tsx (Pure-Move, kein Logik-Change).
 *
 * Konsumenten:
 *   - pages/NvDispositionPage.tsx
 *   - components/nv/TourCard.tsx
 *   - components/nv/CapacityBars.tsx
 *   - components/nv/eligColumns.tsx
 */

export type TourGebiet = {
  id: string;
  code: string;
  name: string;
  farbe?: string | null;
  plz_pattern?: string[] | null;
};

export type StammTour = {
  id: string;
  code: string;
  name: string;
  nv_tour_gebiet_id: string;
  default_subunternehmer_id: string | null;
  nv_tour_gebiet?: TourGebiet;
};

export type Customer = { id: string; customer_number: string; name: string };

export type Address = {
  id: string;
  name?: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country_code: string | null;
};

export type AddressGeo = Address & {
  lat?: string | number | null;
  lng?: string | number | null;
};

export type EligibleShipment = {
  id: string;
  shipment_number: string;
  customer_id: string | null;
  loading_date: string;
  delivery_date: string;
  package_count: number;
  total_weight_kg?: string | number | null;
  total_ldm?: string | number | null;
  customer?: Customer | null;
  delivery_address?: AddressGeo | null;
  loading_address?: AddressGeo | null;
  pin_address?: AddressGeo | null;
  mode?: 'PICKUP' | 'DELIVERY';
  matched_tour_gebiet_id: string | null;
  matched_tour_gebiet_code: string | null;
  is_stamm_kunde: boolean;
};

export type Stop = {
  id: string;
  position: number;
  status: string;
  stop_type?: 'PICKUP' | 'DELIVERY';
  servicezeit_min: number | null;
  routing_klasse: string | null;
  is_stamm_kunde?: boolean;
  shipment?: {
    id: string;
    shipment_number: string;
    customer_id: string | null;
    package_count?: number | null;
    weight_kg?: string | number | null;
    volume_m3?: string | number | null;
    ldm?: string | number | null;
    length_cm?: number | null;
    width_cm?: number | null;
    height_cm?: number | null;
    effective_pallets?: string | number | null;
    freight_revenue?: string | number | null;
    /** R2.3: Charter-Umschlag-Marker im NV-Stop-Row. */
    classification?: string | null;
    addresses_shipments_loading_address_idToaddresses?: AddressGeo | null;
    addresses_shipments_delivery_address_idToaddresses?: AddressGeo | null;
  };
};

export type NvTour = {
  id: string;
  datum: string;
  status: string;
  fahrzeug_typ: string | null;
  fahrer_kosten_eur: string | number | null;
  fahrzeug_kosten_eur: string | number | null;
  kraftstoff_kosten_eur: string | number | null;
  dispo_kosten_eur: string | number | null;
  sonstige_kosten_eur: string | number | null;
  total_kosten_eur: string | number | null;
  kosten_modus?: string | null;
  angefahrene_km: string | number | null;
  geplante_km: string | number | null;
  polyline_geometry?: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  } | null;
  stunden_geleistet: string | number | null;
  notizen: string | null;
  subunternehmer_id: string | null;
  nv_stamm_tour_id: string | null;
  nv_stamm_tour?: {
    id: string;
    code: string;
    name: string;
    nv_tour_gebiet?: TourGebiet;
  } | null;
  subunternehmer?: {
    id: string;
    name: string;
    business_partner?: { name: string } | null;
  } | null;
  stops: Stop[];
};

/** Tour-Radius (km) für Map-Auto-Zoom. Quasi-Konstante. */
export const TOUR_RADIUS_KM = 20;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pickup-Datum-Badge: Heute / Überfällig — sonst null.
 * Konsumiert in eligColumns (Status-Spalte).
 */
export function pickupBadge(
  loadingDateIso: string,
): { label: string; cls: string } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ld = new Date(loadingDateIso);
  ld.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (ld.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 0) {
    return {
      label: `Überfällig ${Math.abs(diffDays)} Tag${Math.abs(diffDays) === 1 ? '' : 'e'}`,
      cls: 'bg-red-100 text-red-700',
    };
  }
  if (diffDays === 0) {
    return { label: 'Heute', cls: 'bg-yellow-100 text-yellow-800' };
  }
  return null;
}
