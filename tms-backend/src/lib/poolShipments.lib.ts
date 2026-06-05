/**
 * Hof-Filter Stufe 1 (E2+E3): Geteilte Pool-Filter-Lib (BE).
 *
 * Liefert pro Tour eine PLZ/Depot-basierte Vorauswahl an
 * undisponierten Sendungen — Anker je Modus, KEIN Geo-Radius
 * (Stufe 2). Konsumenten: nv-touren.service + tours.service
 * (Regel #1 — beide nutzen dieselbe Logik UND denselben Mapper
 * wie die bestehenden /nearby-shipments-Endpoints).
 *
 * Modi (Stufe 1):
 *   nv-pickup    status=new           Anker=Abhol-PLZ-Praefix der
 *                                     PICKUP-Stop-Adressen.
 *                                     Item-Anker (zip/city/lat/lng)
 *                                     = loading-Adresse.
 *   nv-delivery  status=in_warehouse  Anker=Zustell-PLZ-Praefix der
 *                                     DELIVERY-Stop-Adressen.
 *                                     Item-Anker = delivery-Adresse.
 *   fv-sammelgut status=in_warehouse  transport_type=SAMMELGUT,
 *                                     Anker=distinct Ziel-Depots
 *                                     (relation.network_partner_id).
 *                                     Item-Anker = loading-Adresse
 *                                     (wie FV-nearby).
 *
 * Item-Shape (ShipmentPoolItem): EXAKT die nearby-Shape, damit
 * FE-Konsumenten (YardPanel, NvLoadingPlanHofPanel) den Endpoint
 * nur in der URL austauschen müssen. Für nv-delivery ist die
 * Anker-Adresse (zip/city/lat/lng) die delivery-Adresse statt
 * der loading-Adresse — sonst identisch.
 *
 * Algorithmus (alle Modi):
 *   1. Tour laden (schlank: nur Anker-Felder).
 *   2. Anker-Set bilden — KEIN Schneeball, nur initial disponierte.
 *   3. Pool-Query (tour_id=null, deleted_at=null, status/tt passend,
 *      ohne Anker → leer).
 *   4. Cap 500 (Schutz, analog nearby-Endpoint).
 *   5. mapShipmentToPoolItem pro Kandidat — Shape-Parität mit nearby.
 *
 * Hinweis E1: hall_locations.zip (Migration 50) ist NICHT der
 * FV-Sammelgut-Anker — Depots sitzen in business_partners via
 * relations.network_partner_id. E1 bleibt liegen ohne Konsumenten;
 * kein Rueckbau noetig.
 */

import { haversineKm } from './geo.lib';

export type PoolMode = 'nv-pickup' | 'nv-delivery' | 'fv-sammelgut';

export const NV_PREFIX_DIGITS_DEFAULT = 3;
export const POOL_CAP_DEFAULT = 500;

/** C3 (Sprint Geo-Hof): Default-Radien pro Modus.
 *  NV ~ prefix3-aequivalent; FV deutlich groesser (Sammelgut bringt
 *  100-km-Bullets nach Depot). Override via PoolOpts.radiusKm. */
export const NV_RADIUS_KM_DEFAULT = 20;
export const FV_RADIUS_KM_DEFAULT = 100;

export interface PoolOpts {
  /** PLZ-Praefix-Tiefe (NV-Modi). Default 3 (~20km Cluster). */
  prefixDigits?: number;
  /** Max Sendungen im Output (Schutz). Default 500. */
  cap?: number;
  /** C3: Geo-Radius in km. Default je Modus
   *  (NV=20, FV=100). 0 deaktiviert den Radius-Pfad. */
  radiusKm?: number;
}

/** Item-Shape entspricht 1:1 der nearby-Shape (NV + FV-extras). */
export interface ShipmentPoolItem {
  id: string;
  shipment_number: string;
  weight_kg: number | null;
  ldm: number | null;
  volume_m3: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  effective_pallets: number | null;
  /** C2 (Sprint Geo-Hof): direkt verfuegbar fuer clusterByCustomerId.
   *  Vorher nur via .customer_name lesbar; jetzt explizit fuer
   *  Empfaenger-Buendel. Optional (Stammdaten-Luecken). */
  customer_id: string | null;
  customer_name: string | null;
  /** Anker-Adresse: nv-pickup → loading, nv-delivery → delivery,
   *  fv-sammelgut → loading. Falls Adresse fehlt 0/null. */
  lat: number;
  lng: number;
  zip: string | null;
  city: string | null;
  loading_street: string | null;
  loading_country: string | null;
  /** Pool: 0 (kein Haversine). nearby: tatsaechliche Distanz. */
  distance_km: number;
  package_items: Array<{
    id: string;
    length_cm: number | null;
    width_cm: number | null;
    height_cm: number | null;
    weight_kg: number | null;
    quantity: number | null;
    stackable: boolean;
  }>;
  // FV-only (in NV-Modi null/undefined). Im NV-pool sind die
  // Felder als null gesetzt, damit das Type stabil bleibt.
  transport_type: string | null;
  delivery_zip: string | null;
  delivery_city: string | null;
  delivery_country: string | null;
  relation_id: string | null;
  relation_code: string | null;
  depot_label: string | null;
}

export interface MapItemOpts {
  /** Quelle fuer zip/city/lat/lng am Item. */
  anchor: 'loading' | 'delivery';
  /** Wenn true, FV-Felder (transport_type, delivery_*, relation_*,
   *  depot_label) werden befuellt; sonst null. */
  withFvFields?: boolean;
  /** Default 0 (Pool). nearby-Aufrufer reicht Haversine durch. */
  distance_km?: number;
}

/** Shared Select fuer Pool + nearby — identische Shape garantiert. */
export const POOL_ITEM_SELECT = {
  id: true,
  shipment_number: true,
  weight_kg: true,
  ldm: true,
  volume_m3: true,
  length_cm: true,
  width_cm: true,
  height_cm: true,
  effective_pallets: true,
  loading_date: true,
  transport_type: true,
  relation_id: true,
  // C2: customer_id direkt — Voraussetzung fuer clusterByCustomerId.
  customer_id: true,
  customers: { select: { id: true, name: true } },
  addresses_shipments_loading_address_idToaddresses: {
    select: {
      lat: true,
      lng: true,
      zip: true,
      city: true,
      street: true,
      country_code: true,
    },
  },
  addresses_shipments_delivery_address_idToaddresses: {
    select: {
      lat: true,
      lng: true,
      zip: true,
      city: true,
      street: true,
      country_code: true,
    },
  },
  relation: {
    select: {
      code: true,
      network_partner_id: true,
      network_partner: {
        select: { id: true, name: true, partner_number: true },
      },
      default_hall_location: {
        select: { code: true, description: true },
      },
    },
  },
  shipment_package_items: {
    orderBy: { line_index: 'asc' as const },
    select: {
      id: true,
      length_cm: true,
      width_cm: true,
      height_cm: true,
      weight_kg: true,
      quantity: true,
      stackable: true,
    },
  },
} as const;

/**
 * Wandelt einen Prisma-shipment-Datensatz (POOL_ITEM_SELECT) in
 * das public ShipmentPoolItem-Shape. WIRD VON pool UND nearby
 * konsumiert — Shape-Drift wird so verhindert.
 */
export function mapShipmentToPoolItem(
  c: any,
  opts: MapItemOpts,
): ShipmentPoolItem {
  const loading = c.addresses_shipments_loading_address_idToaddresses ?? null;
  const delivery = c.addresses_shipments_delivery_address_idToaddresses ?? null;
  const anchorAddr = opts.anchor === 'delivery' ? delivery : loading;
  const lat = anchorAddr?.lat != null ? Number(anchorAddr.lat) : 0;
  const lng = anchorAddr?.lng != null ? Number(anchorAddr.lng) : 0;
  const np = c.relation?.network_partner ?? null;
  const depotLabel =
    c.relation?.default_hall_location?.description ??
    c.relation?.default_hall_location?.code ??
    np?.name ??
    null;
  return {
    id: c.id,
    shipment_number: c.shipment_number,
    weight_kg: c.weight_kg != null ? Number(c.weight_kg) : null,
    ldm: c.ldm != null ? Number(c.ldm) : null,
    volume_m3: c.volume_m3 != null ? Number(c.volume_m3) : null,
    length_cm: c.length_cm ?? null,
    width_cm: c.width_cm ?? null,
    height_cm: c.height_cm ?? null,
    effective_pallets:
      c.effective_pallets != null ? Number(c.effective_pallets) : null,
    customer_id: c.customer_id ?? c.customers?.id ?? null,
    customer_name: c.customers?.name ?? null,
    lat,
    lng,
    zip: anchorAddr?.zip ?? null,
    city: anchorAddr?.city ?? null,
    // loading_street/loading_country bleiben — wie nearby — IMMER
    // aus loading_address (Per-Sendung-Label im FE).
    loading_street: loading?.street ?? null,
    loading_country: loading?.country_code ?? null,
    distance_km: opts.distance_km ?? 0,
    package_items: (c.shipment_package_items ?? []).map((it: any) => ({
      id: it.id,
      length_cm: it.length_cm ?? null,
      width_cm: it.width_cm ?? null,
      height_cm: it.height_cm ?? null,
      weight_kg: it.weight_kg != null ? Number(it.weight_kg) : null,
      quantity: it.quantity ?? null,
      stackable: it.stackable,
    })),
    transport_type: opts.withFvFields ? (c.transport_type ?? null) : null,
    delivery_zip: opts.withFvFields ? (delivery?.zip ?? null) : null,
    delivery_city: opts.withFvFields ? (delivery?.city ?? null) : null,
    delivery_country: opts.withFvFields
      ? (delivery?.country_code ?? null)
      : null,
    relation_id: opts.withFvFields ? (c.relation_id ?? null) : null,
    relation_code: opts.withFvFields ? (c.relation?.code ?? null) : null,
    depot_label: opts.withFvFields ? depotLabel : null,
  };
}

/** Liefert den PLZ-Praefix (lowercase, getrimmt) oder null. */
function plzPrefix(zip: string | null | undefined, digits: number): string | null {
  if (!zip) return null;
  const s = String(zip).trim();
  if (!s) return null;
  return s.slice(0, Math.max(1, digits));
}

/* ─── C2 (Sprint Geo-Hof): Cluster-Helper ─────────────────────────
 * Reine Pure-Functions auf ShipmentPoolItem[]. Werden in C3 von
 * resolvePool konsumiert; hier additiv vorbereitet (kein Caller). */

/**
 * Gruppiert Items nach customer_id. Items ohne customer_id landen
 * unter dem speziellen Key `__no_customer__` (statt verloren zu gehen).
 * Reihenfolge innerhalb einer Gruppe = Reihenfolge im Input.
 */
export function clusterByCustomerId(
  items: ShipmentPoolItem[],
): Map<string, ShipmentPoolItem[]> {
  const out = new Map<string, ShipmentPoolItem[]>();
  for (const it of items) {
    const key = it.customer_id ?? '__no_customer__';
    const bucket = out.get(key);
    if (bucket) bucket.push(it);
    else out.set(key, [it]);
  }
  return out;
}

/**
 * Gruppiert Items nach Zip-Prefix der Anker-Adresse (it.zip). Items
 * ohne Zip landen unter `__no_zip__`. digits begrenzt durch plzPrefix
 * (mindestens 1).
 */
export function clusterByZip(
  items: ShipmentPoolItem[],
  digits: number,
): Map<string, ShipmentPoolItem[]> {
  const out = new Map<string, ShipmentPoolItem[]>();
  for (const it of items) {
    const key = plzPrefix(it.zip, digits) ?? '__no_zip__';
    const bucket = out.get(key);
    if (bucket) bucket.push(it);
    else out.set(key, [it]);
  }
  return out;
}

/**
 * Filtert Items, deren Anker-Koordinaten innerhalb radiusKm um
 * (anchorLat, anchorLng) liegen. Items ohne lat/lng (oder 0/0,
 * was im Mapper als "Adresse fehlt" gesetzt wird) werden sauber
 * aussortiert — KEIN NaN-Vergleich, kein false-positive bei
 * 0,0-Koordinaten. Items mit gueltigen Koordinaten bekommen
 * .distance_km mit der Haversine-Distanz gesetzt (sonst 0).
 */
export function clusterByRadius(
  items: ShipmentPoolItem[],
  anchorLat: number,
  anchorLng: number,
  radiusKm: number,
): ShipmentPoolItem[] {
  if (!Number.isFinite(anchorLat) || !Number.isFinite(anchorLng)) return [];
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return [];
  const anchor = { lat: anchorLat, lng: anchorLng };
  const out: ShipmentPoolItem[] = [];
  for (const it of items) {
    // null-safe: 0/0 = Mapper-Sentinel "Adresse fehlt" → ausschliessen.
    if (
      !Number.isFinite(it.lat) ||
      !Number.isFinite(it.lng) ||
      (it.lat === 0 && it.lng === 0)
    ) {
      continue;
    }
    const d = haversineKm(anchor, { lat: it.lat, lng: it.lng });
    if (d <= radiusKm) {
      out.push({ ...it, distance_km: d });
    }
  }
  return out;
}

/**
 * Zentrale Lib-Funktion. Caller (nv-touren.service / tours.service)
 * reicht prisma + tourId + mode rein.
 *
 * Wirft Error('Tour nicht gefunden') wenn die Tour nicht existiert.
 * Andere Fehler propagieren (Caller wandelt in HTTP-Status).
 */
export async function resolvePool(
  prisma: any,
  tourId: string,
  mode: PoolMode,
  opts?: PoolOpts,
): Promise<ShipmentPoolItem[]> {
  const prefixDigits = opts?.prefixDigits ?? NV_PREFIX_DIGITS_DEFAULT;
  const cap = opts?.cap ?? POOL_CAP_DEFAULT;
  // C3: mode-default-Radius mit Override.
  const defaultRadius =
    mode === 'fv-sammelgut'
      ? FV_RADIUS_KM_DEFAULT
      : NV_RADIUS_KM_DEFAULT;
  const radiusKm = opts?.radiusKm ?? defaultRadius;

  if (mode === 'nv-pickup' || mode === 'nv-delivery') {
    return resolveNvPool(prisma, tourId, mode, prefixDigits, cap, radiusKm);
  }
  if (mode === 'fv-sammelgut') {
    return resolveFvSammelgutPool(
      prisma,
      tourId,
      cap,
      prefixDigits,
      radiusKm,
    );
  }
  throw new Error(`Unbekannter pool mode: ${String(mode)}`);
}

/* ─── C3 Geo-Helfer fuer Anchor-Aufbau ──────────────────────────── */

interface AnchorCoord {
  lat: number;
  lng: number;
}

/** Berechnet eine Bounding-Box um ein Anchor-Coord mit Radius-Padding
 *  in km. Pro Latitude-Grad ~111 km; Longitude skaliert mit cos(lat).
 *  cos-Cap bei 0.01 schuetzt nahe den Polen vor Division durch 0. */
function bboxFor(
  c: AnchorCoord,
  radiusKm: number,
): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
  const dLat = radiusKm / 111;
  const cosLat = Math.cos((c.lat * Math.PI) / 180);
  const dLng = radiusKm / (111 * Math.max(cosLat, 0.01));
  return {
    latMin: c.lat - dLat,
    latMax: c.lat + dLat,
    lngMin: c.lng - dLng,
    lngMax: c.lng + dLng,
  };
}

/** Liest die Anker-Adresse einer Tour-Stop-Shipment je nach Mode. */
function pickAnchorAddress(
  shipment: any,
  anchor: 'loading' | 'delivery',
): { zip: string | null; country: string; lat: number | null; lng: number | null } {
  const a =
    anchor === 'loading'
      ? shipment?.addresses_shipments_loading_address_idToaddresses
      : shipment?.addresses_shipments_delivery_address_idToaddresses;
  return {
    zip: a?.zip ?? null,
    country: (a?.country_code ?? 'DE').toUpperCase(),
    lat: a?.lat != null ? Number(a.lat) : null,
    lng: a?.lng != null ? Number(a.lng) : null,
  };
}

/** Pruef-Hilfe: hat ein POOL_ITEM_SELECT-row eine Tour-Anker-Adresse
 *  innerhalb radiusKm zu MINDESTENS EINEM ankerCoord? */
function rowMatchesRadius(
  row: any,
  anchor: 'loading' | 'delivery',
  ankerCoords: AnchorCoord[],
  radiusKm: number,
): boolean {
  if (radiusKm <= 0 || ankerCoords.length === 0) return false;
  const a =
    anchor === 'loading'
      ? row?.addresses_shipments_loading_address_idToaddresses
      : row?.addresses_shipments_delivery_address_idToaddresses;
  const lat = a?.lat != null ? Number(a.lat) : NaN;
  const lng = a?.lng != null ? Number(a.lng) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  for (const c of ankerCoords) {
    const d = haversineKm({ lat, lng }, c);
    if (d <= radiusKm) return true;
  }
  return false;
}

// ─── NV (pickup | delivery) ───────────────────────────────────

async function resolveNvPool(
  prisma: any,
  tourId: string,
  mode: 'nv-pickup' | 'nv-delivery',
  prefixDigits: number,
  cap: number,
  radiusKm: number,
): Promise<ShipmentPoolItem[]> {
  const stopTypeFilter = mode === 'nv-pickup' ? 'PICKUP' : 'DELIVERY';
  const status = mode === 'nv-pickup' ? 'new' : 'in_warehouse';
  const anchor: 'loading' | 'delivery' =
    mode === 'nv-pickup' ? 'loading' : 'delivery';
  const anchorAddrField =
    anchor === 'loading'
      ? 'addresses_shipments_loading_address_idToaddresses'
      : 'addresses_shipments_delivery_address_idToaddresses';

  // C3: Tour-Query holt zusaetzlich customer_id + lat/lng der
  // Anker-Adresse fuer customerId-Match + Radius-Match.
  const tour = await prisma.nv_touren.findUnique({
    where: { id: tourId },
    select: {
      id: true,
      stops: {
        where: { stop_type: stopTypeFilter },
        select: {
          stop_type: true,
          shipment: {
            select: {
              customer_id: true,
              addresses_shipments_loading_address_idToaddresses: {
                select: { zip: true, country_code: true, lat: true, lng: true },
              },
              addresses_shipments_delivery_address_idToaddresses: {
                select: { zip: true, country_code: true, lat: true, lng: true },
              },
            },
          },
        },
      },
    },
  });
  if (!tour) throw new Error('Tour nicht gefunden');

  const ankerPrefixSet = new Set<string>();
  const ankerCustomerIds = new Set<string>();
  const ankerCoords: AnchorCoord[] = [];
  for (const s of tour.stops ?? []) {
    const a = pickAnchorAddress(s.shipment, anchor);
    const prefix = plzPrefix(a.zip, prefixDigits);
    if (prefix) ankerPrefixSet.add(`${a.country}|${prefix}`);
    const cid: string | null = s.shipment?.customer_id ?? null;
    if (cid) ankerCustomerIds.add(cid);
    if (a.lat != null && a.lng != null && Number.isFinite(a.lat) && Number.isFinite(a.lng)) {
      ankerCoords.push({ lat: a.lat, lng: a.lng });
    }
  }

  // C3: DB-WHERE OR-Cascade — zip-Prefix (bestehend) OR customerId
  // OR Bounding-Box pro Anker-Coord (Radius vor-filter; Haversine-
  // refine im Post-Filter unten).
  const orClauses: any[] = [];
  for (const key of ankerPrefixSet) {
    const [country, prefix] = key.split('|');
    orClauses.push({
      [anchorAddrField]: {
        country_code: country,
        zip: { startsWith: prefix },
      },
    });
  }
  if (ankerCustomerIds.size > 0) {
    orClauses.push({ customer_id: { in: Array.from(ankerCustomerIds) } });
  }
  if (radiusKm > 0) {
    for (const c of ankerCoords) {
      const bb = bboxFor(c, radiusKm);
      orClauses.push({
        [anchorAddrField]: {
          lat: { gte: bb.latMin, lte: bb.latMax },
          lng: { gte: bb.lngMin, lte: bb.lngMax },
        },
      });
    }
  }
  if (orClauses.length === 0) return [];

  const where: Record<string, unknown> = {
    deleted_at: null,
    tour_id: null,
    status,
    OR: orClauses,
  };
  const rows = await prisma.shipments.findMany({
    where,
    take: cap,
    select: POOL_ITEM_SELECT,
  });

  // C3: Post-Filter — Bounding-Box im SQL ist nur grobe Vorauswahl;
  // Haversine-refine schliesst Ecken der BBox aus. Items, die ueber
  // zip-Prefix ODER customerId reinkamen, bleiben unabhaengig vom
  // Radius — additive OR-Regel.
  const filtered = rows.filter((r: any) => {
    const a =
      anchor === 'loading'
        ? r?.addresses_shipments_loading_address_idToaddresses
        : r?.addresses_shipments_delivery_address_idToaddresses;
    const country = (a?.country_code ?? 'DE').toUpperCase();
    const zip = a?.zip ?? null;
    // (a) zip-Prefix-Match
    for (const key of ankerPrefixSet) {
      const [c, p] = key.split('|');
      if (c === country && typeof zip === 'string' && zip.startsWith(p)) {
        return true;
      }
    }
    // (b) customerId-Match
    if (r.customer_id && ankerCustomerIds.has(r.customer_id)) return true;
    // (c) Radius-Match (Haversine refine)
    return rowMatchesRadius(r, anchor, ankerCoords, radiusKm);
  });

  return filtered.map((r: any) => mapShipmentToPoolItem(r, { anchor }));
}

// ─── FV-Sammelgut ─────────────────────────────────────────────

async function resolveFvSammelgutPool(
  prisma: any,
  tourId: string,
  cap: number,
  prefixDigits: number,
  radiusKm: number,
): Promise<ShipmentPoolItem[]> {
  // C3: zusaetzlich customer_id + delivery_address (zip, country, lat,
  // lng) je Tour-Sendung — Anker fuer customerId-Match + zip-Prefix
  // (FV neu) + Radius-Match. Item-Mapping anchor bleibt 'loading'
  // (FV-Konvention), aber der TOUR-Anker fuer Geo ist DELIVERY-seitig
  // (Sammelgut-Cluster ist Empfaenger-zentriert).
  const tour = await prisma.tours.findUnique({
    where: { id: tourId },
    select: {
      id: true,
      shipments: {
        where: { deleted_at: null },
        select: {
          customer_id: true,
          relation: { select: { network_partner_id: true } },
          addresses_shipments_delivery_address_idToaddresses: {
            select: { zip: true, country_code: true, lat: true, lng: true },
          },
        },
      },
    },
  });
  if (!tour) throw new Error('Tour nicht gefunden');

  const depotSet = new Set<string>();
  const ankerPrefixSet = new Set<string>();
  const ankerCustomerIds = new Set<string>();
  const ankerCoords: AnchorCoord[] = [];
  for (const sh of tour.shipments ?? []) {
    const npid = sh.relation?.network_partner_id;
    if (npid) depotSet.add(npid);
    const cid: string | null = sh.customer_id ?? null;
    if (cid) ankerCustomerIds.add(cid);
    const a = pickAnchorAddress(sh, 'delivery');
    const prefix = plzPrefix(a.zip, prefixDigits);
    if (prefix) ankerPrefixSet.add(`${a.country}|${prefix}`);
    if (a.lat != null && a.lng != null && Number.isFinite(a.lat) && Number.isFinite(a.lng)) {
      ankerCoords.push({ lat: a.lat, lng: a.lng });
    }
  }

  // C3: OR-Cascade — bestehender Depot-Match + customerId + zip-Prefix
  // (NEU) + Radius-BBox. Carlos-Annahme (a): Geo ERGAENZT Depot-Match.
  const orClauses: any[] = [];
  if (depotSet.size > 0) {
    orClauses.push({
      relation: { network_partner_id: { in: Array.from(depotSet) } },
    });
  }
  if (ankerCustomerIds.size > 0) {
    orClauses.push({ customer_id: { in: Array.from(ankerCustomerIds) } });
  }
  for (const key of ankerPrefixSet) {
    const [country, prefix] = key.split('|');
    orClauses.push({
      addresses_shipments_delivery_address_idToaddresses: {
        country_code: country,
        zip: { startsWith: prefix },
      },
    });
  }
  if (radiusKm > 0) {
    for (const c of ankerCoords) {
      const bb = bboxFor(c, radiusKm);
      orClauses.push({
        addresses_shipments_delivery_address_idToaddresses: {
          lat: { gte: bb.latMin, lte: bb.latMax },
          lng: { gte: bb.lngMin, lte: bb.lngMax },
        },
      });
    }
  }
  if (orClauses.length === 0) return [];

  const rows = await prisma.shipments.findMany({
    where: {
      deleted_at: null,
      tour_id: null,
      status: 'in_warehouse',
      transport_type: 'SAMMELGUT',
      OR: orClauses,
    },
    take: cap,
    select: POOL_ITEM_SELECT,
  });

  // C3: Post-Filter — wie NV: BBox refinen, zip/customerId/Depot
  // sind exakt; Items, die einen der vier Pfade treffen, bleiben drin.
  const filtered = rows.filter((r: any) => {
    // (1) Depot-Match
    if (
      r.relation_id &&
      r.relation?.network_partner_id &&
      depotSet.has(r.relation.network_partner_id)
    ) {
      return true;
    }
    // (2) customerId-Match
    if (r.customer_id && ankerCustomerIds.has(r.customer_id)) return true;
    // (3) zip-Prefix-Match (delivery)
    const a = r?.addresses_shipments_delivery_address_idToaddresses;
    const country = (a?.country_code ?? 'DE').toUpperCase();
    const zip = a?.zip ?? null;
    for (const key of ankerPrefixSet) {
      const [c, p] = key.split('|');
      if (c === country && typeof zip === 'string' && zip.startsWith(p)) {
        return true;
      }
    }
    // (4) Radius-Match (delivery)
    return rowMatchesRadius(r, 'delivery', ankerCoords, radiusKm);
  });

  return filtered.map((r: any) =>
    mapShipmentToPoolItem(r, { anchor: 'loading', withFvFields: true }),
  );
}

// ─── Mode-Validation (Caller-Helper) ─────────────────────────

const NV_MODES: readonly PoolMode[] = ['nv-pickup', 'nv-delivery'];
const FV_MODES: readonly PoolMode[] = ['fv-sammelgut'];

export function isNvPoolMode(m: unknown): m is 'nv-pickup' | 'nv-delivery' {
  return typeof m === 'string' && (NV_MODES as readonly string[]).includes(m);
}

export function isFvPoolMode(m: unknown): m is 'fv-sammelgut' {
  return typeof m === 'string' && (FV_MODES as readonly string[]).includes(m);
}
