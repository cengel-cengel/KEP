export interface ShipmentAddress {
  id?: string;
  name?: string;
  city?: string;
  countryCode?: string;
  country_code?: string;
  lat?: number | null;
  lng?: number | null;
}

/** Response from GET /shipments/map – shipments with coordinates */
export interface ShipmentMapItem {
  id: string;
  shipment_number: string;
  status: string;
  freight_revenue?: number | null;
  contribution_margin?: number | null;
  cm_percent?: number | null;
  pre_carriage_cost?: number | null;
  main_carriage_cost?: number | null;
  on_carriage_cost?: number | null;
  total_cost?: number | null;
  tour_id?: string | null;
  tour_position?: number | null;
  ldm?: number | null;
  inbound_delivery_type?: string | null;
  outbound_delivery_type?: string | null;
  customers?: { name: string } | null;
  addresses_shipments_loading_address_idToaddresses?: { id: string; lat?: unknown; lng?: unknown; city?: string; name?: string } | null;
  addresses_shipments_delivery_address_idToaddresses?: { id: string; lat?: unknown; lng?: unknown; city?: string; name?: string } | null;
}

export interface Shipment {
  id: string;
  shipmentNumber?: string;
  shipment_number?: string;
  transport_type?: string;
  status: string;
  loadingDate?: string;
  loading_date?: string;
  freightRevenue?: number;
  freight_revenue?: number;
  contributionMargin?: number;
  contribution_margin?: number;
  ldm?: number | null;
  customer?: { id: string; name: string };
  customers?: { id: string; name: string };
  inbound_delivery_type?: string | null;
  outbound_delivery_type?: string | null;
  outbound_partner_name?: string | null;
  has_nv_disposition?: boolean | null;
  has_damage_report?: boolean | null;
  has_return?: boolean | null;
  return_status?: string | null;
  loadingAddress?: ShipmentAddress;
  deliveryAddress?: ShipmentAddress;
  addresses_shipments_loading_address_idToaddresses?: ShipmentAddress;
  addresses_shipments_delivery_address_idToaddresses?: ShipmentAddress;

  has_active_lock?: boolean | null;
  lock_types?: string | null;
  last_event_type?: string | null;
  last_event_at?: string | null;

  shipment_package_items?: Array<{
    id?: string;
    line_index?: number;
    stackable?: boolean;
    package_type?: string;
    quantity?: number;
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
    weight_kg?: number | string;
  }>;

  relation_id?: string | null;
  relation?: {
    id: string;
    code: string;
    name: string;
    country_to?: string | null;
  } | null;

  /** R2.3: Charter-Umschlag-Flow. */
  classification?: string | null;
  /** R2.3: FV-Tour-FK (Hauptlauf). */
  tour_id?: string | null;
  tours?: {
    id: string;
    tour_number?: string | null;
    tour_date?: string | null;
    status?: string | null;
    subcontractors?: { id: string; name: string } | null;
  } | null;
  /** R2.3: NV-Vorhol-Tour-Link (PICKUP-Stop-Set). */
  nv_tour_stops?: Array<{
    id: string;
    stop_type?: string | null;
    status?: string | null;
    nv_tour?: {
      id: string;
      datum?: string | null;
      status?: string | null;
      nv_stamm_tour?: { code?: string | null; name?: string | null } | null;
    } | null;
  }>;
}
