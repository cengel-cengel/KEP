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

export interface PoolOpts {
  /** PLZ-Praefix-Tiefe (NV-Modi). Default 3 (~20km Cluster). */
  prefixDigits?: number;
  /** Max Sendungen im Output (Schutz). Default 500. */
  cap?: number;
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

  if (mode === 'nv-pickup' || mode === 'nv-delivery') {
    return resolveNvPool(prisma, tourId, mode, prefixDigits, cap);
  }
  if (mode === 'fv-sammelgut') {
    return resolveFvSammelgutPool(prisma, tourId, cap);
  }
  throw new Error(`Unbekannter pool mode: ${String(mode)}`);
}

// ─── NV (pickup | delivery) ───────────────────────────────────

async function resolveNvPool(
  prisma: any,
  tourId: string,
  mode: 'nv-pickup' | 'nv-delivery',
  prefixDigits: number,
  cap: number,
): Promise<ShipmentPoolItem[]> {
  const stopTypeFilter = mode === 'nv-pickup' ? 'PICKUP' : 'DELIVERY';
  const status = mode === 'nv-pickup' ? 'new' : 'in_warehouse';
  const anchor: 'loading' | 'delivery' =
    mode === 'nv-pickup' ? 'loading' : 'delivery';

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
              addresses_shipments_loading_address_idToaddresses: {
                select: { zip: true, country_code: true },
              },
              addresses_shipments_delivery_address_idToaddresses: {
                select: { zip: true, country_code: true },
              },
            },
          },
        },
      },
    },
  });
  if (!tour) throw new Error('Tour nicht gefunden');

  const ankerSet = new Set<string>();
  for (const s of tour.stops ?? []) {
    const addr =
      anchor === 'loading'
        ? s.shipment?.addresses_shipments_loading_address_idToaddresses
        : s.shipment?.addresses_shipments_delivery_address_idToaddresses;
    const prefix = plzPrefix(addr?.zip, prefixDigits);
    const country = (addr?.country_code ?? 'DE').toUpperCase();
    if (!prefix) continue;
    ankerSet.add(`${country}|${prefix}`);
  }
  if (ankerSet.size === 0) return [];

  type AnkerOr = { country_code: string; zip: { startsWith: string } };
  const anchorOrs: AnkerOr[] = [];
  for (const key of ankerSet) {
    const [country, prefix] = key.split('|');
    anchorOrs.push({ country_code: country, zip: { startsWith: prefix } });
  }
  const addressFilter = { OR: anchorOrs };
  const where: Record<string, unknown> = {
    deleted_at: null,
    tour_id: null,
    status,
    ...(anchor === 'loading'
      ? { addresses_shipments_loading_address_idToaddresses: addressFilter }
      : { addresses_shipments_delivery_address_idToaddresses: addressFilter }),
  };
  const rows = await prisma.shipments.findMany({
    where,
    take: cap,
    select: POOL_ITEM_SELECT,
  });
  return rows.map((r: any) => mapShipmentToPoolItem(r, { anchor }));
}

// ─── FV-Sammelgut ─────────────────────────────────────────────

async function resolveFvSammelgutPool(
  prisma: any,
  tourId: string,
  cap: number,
): Promise<ShipmentPoolItem[]> {
  const tour = await prisma.tours.findUnique({
    where: { id: tourId },
    select: {
      id: true,
      shipments: {
        where: { deleted_at: null },
        select: {
          relation: { select: { network_partner_id: true } },
        },
      },
    },
  });
  if (!tour) throw new Error('Tour nicht gefunden');

  const depotSet = new Set<string>();
  for (const sh of tour.shipments ?? []) {
    const npid = sh.relation?.network_partner_id;
    if (npid) depotSet.add(npid);
  }
  if (depotSet.size === 0) return [];

  const rows = await prisma.shipments.findMany({
    where: {
      deleted_at: null,
      tour_id: null,
      status: 'in_warehouse',
      transport_type: 'SAMMELGUT',
      relation: { network_partner_id: { in: Array.from(depotSet) } },
    },
    take: cap,
    select: POOL_ITEM_SELECT,
  });
  return rows.map((r: any) =>
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
