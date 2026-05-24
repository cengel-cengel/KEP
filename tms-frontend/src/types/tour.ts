export interface TourSubcontractor {
  id: string;
  name: string;
}

export interface TourShipment {
  id: string;
  ldm?: number | null;
}

/** API returns snake_case; use both for compatibility */
export interface Tour {
  id: string;
  tourNumber?: string;
  tour_number?: string;
  tourDate?: string;
  tour_date?: string;
  departure_time?: string | null;
  status: string;
  total_ldm?: number | null;
  max_ldm?: number | null;
  maxLdm?: number | null;
  total_revenue?: number | null;
  subcontractor_cost?: number | null;
  contribution_margin?: number | null;
  cm_percent?: number | null;
  cmPercent?: number | null;
  subcontractors?: TourSubcontractor | null;
  subcontractor?: TourSubcontractor | null;
  shipments?: TourShipment[];
  _count?: { shipments?: number };

  released_at?: string | null;
  closed_at?: string | null;
  dispatched_at?: string | null;
  completed_at?: string | null;

  /** Sprint 13: ADR/ZOLL-Sperren auf Tour-Sendungen (Backend angereichert) */
  releaseBlockingLockCount?: number;

  subcontractor_id?: string | null;
  sub_condition_id?: string | null;
  calculated_sub_cost?: number | string | null;
  sub_condition?: { id: string; condition_type?: string | null } | null;

  /** B-4: Soft-Capacity Overload (ratio + flag).
   *  O-3: + vol (Trigger-Achse zusammen mit weight; ldm = INFO). */
  overload?: {
    ldm: number;
    weight: number;
    vol?: number;
    isOverloaded: boolean;
  } | null;
}
