/**
 * Hof-Filter Stufe 1 (E2): Geteilte Pool-Filter-Lib (BE).
 *
 * Liefert pro Tour eine PLZ/Depot-basierte Vorauswahl an
 * undisponierten Sendungen — Anker je Modus, KEIN Geo-Radius
 * (Stufe 2). Konsumenten: nv-touren.service + tours.service
 * (Regel #1 — beide nutzen dieselbe Logik).
 *
 * Modi (Stufe 1):
 *   nv-pickup    status=new           Anker=Abhol-PLZ-Praefix der
 *                                     PICKUP-Stop-Adressen.
 *   nv-delivery  status=in_warehouse  Anker=Zustell-PLZ-Praefix der
 *                                     DELIVERY-Stop-Adressen.
 *   fv-sammelgut status=in_warehouse  transport_type=SAMMELGUT,
 *                                     Anker=distinct Ziel-Depots
 *                                     (relation.network_partner_id).
 *
 * Algorithmus (alle Modi):
 *   1. Tour laden (schlank: nur Anker-Felder).
 *   2. Anker-Set bilden — KEIN Schneeball, nur initial disponierte.
 *   3. Pool-Query (tour_id=null, deleted_at=null, status/tt passend,
 *      ohne Anker → leer).
 *   4. Cap 500 (Schutz, analog nearby-Endpoint).
 *
 * Geo-Faelle (Depot-loser Sammelgut-Fallback 100km, DIREKT_UMSCHLAG-
 * Teilladung 50km) sind Stufe 2 (Geocoding-Voraussetzung) — NICHT
 * hier.
 *
 * Hinweis E1: hall_locations.zip (Migration 50) ist NICHT der
 * FV-Sammelgut-Anker — Depots sitzen in business_partners via
 * relations.network_partner_id. E1 bleibt liegen ohne Konsumenten;
 * kein Rueckbau noetig.
 */

export type PoolMode = 'nv-pickup' | 'nv-delivery' | 'fv-sammelgut';

export const NV_PREFIX_DIGITS_DEFAULT = 3;
export const POOL_CAP_DEFAULT = 500;

export interface PoolOpts {
  /** PLZ-Praefix-Tiefe (NV-Modi). Default 3 (~20km Cluster). */
  prefixDigits?: number;
  /** Max Sendungen im Output (Schutz). Default 500. */
  cap?: number;
}

/** Eintrag pro Pool-Sendung — flach, FE-konsumierbar. */
export interface ShipmentPoolItem {
  id: string;
  shipment_number: string;
  status: string;
  transport_type: string | null;
  customer_name: string | null;
  weight_kg: number | null;
  ldm: number | null;
  volume_m3: number | null;
  // Anker-Adresse (Pool-relevant): NV-pickup → loading, sonst delivery.
  anchor_zip: string | null;
  anchor_city: string | null;
  anchor_country: string | null;
  // FV-Sammelgut: Ziel-Depot zur Anzeige (sonst null).
  depot_id: string | null;
  depot_name: string | null;
  depot_number: string | null;
}

/** Liefert den PLZ-Praefix (lowercase, getrimmt) oder null. */
function plzPrefix(zip: string | null | undefined, digits: number): string | null {
  if (!zip) return null;
  const s = String(zip).trim();
  if (!s) return null;
  return s.slice(0, Math.max(1, digits));
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
  // Compile-time exhaustiveness — Caller validiert mode bereits.
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

  // Schlanker Tour-Load: nur Anker-Adressen pro Stop nach stop_type.
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

  // Anker bilden: pro Stop die zum stop_type passende Adresse.
  // Set<`${country}|${prefix}`>, damit Land + PLZ-Praefix kombiniert.
  const ankerSet = new Set<string>();
  for (const s of tour.stops ?? []) {
    const addr =
      mode === 'nv-pickup'
        ? s.shipment?.addresses_shipments_loading_address_idToaddresses
        : s.shipment?.addresses_shipments_delivery_address_idToaddresses;
    const prefix = plzPrefix(addr?.zip, prefixDigits);
    const country = (addr?.country_code ?? 'DE').toUpperCase();
    if (!prefix) continue;
    ankerSet.add(`${country}|${prefix}`);
  }
  if (ankerSet.size === 0) return [];

  // Anker → OR-Liste fuer Prisma. Pool-Adresse abhaengig vom Modus.
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
    ...(mode === 'nv-pickup'
      ? { addresses_shipments_loading_address_idToaddresses: addressFilter }
      : { addresses_shipments_delivery_address_idToaddresses: addressFilter }),
  };

  const rows = await prisma.shipments.findMany({
    where,
    take: cap,
    select: poolSelect(),
  });
  return rows.map((r: any) => toPoolItem(r, mode));
}

// ─── FV-Sammelgut ─────────────────────────────────────────────

async function resolveFvSammelgutPool(
  prisma: any,
  tourId: string,
  cap: number,
): Promise<ShipmentPoolItem[]> {
  // Schlanker Tour-Load: nur network_partner_id pro Sendung.
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

  // Pool: Sammelgut + in_warehouse + relation.network_partner_id ∈ depots.
  const rows = await prisma.shipments.findMany({
    where: {
      deleted_at: null,
      tour_id: null,
      status: 'in_warehouse',
      transport_type: 'SAMMELGUT',
      relation: {
        network_partner_id: { in: Array.from(depotSet) },
      },
    },
    take: cap,
    select: poolSelect(),
  });
  return rows.map((r: any) => toPoolItem(r, 'fv-sammelgut'));
}

// ─── Shared select / mapping ──────────────────────────────────

function poolSelect() {
  return {
    id: true,
    shipment_number: true,
    status: true,
    transport_type: true,
    weight_kg: true,
    ldm: true,
    volume_m3: true,
    customers: { select: { name: true } },
    addresses_shipments_loading_address_idToaddresses: {
      select: { zip: true, city: true, country_code: true },
    },
    addresses_shipments_delivery_address_idToaddresses: {
      select: { zip: true, city: true, country_code: true },
    },
    relation: {
      select: {
        network_partner_id: true,
        network_partner: {
          select: { id: true, name: true, partner_number: true },
        },
      },
    },
  } as const;
}

function toPoolItem(r: any, mode: PoolMode): ShipmentPoolItem {
  const anchorAddr =
    mode === 'nv-pickup'
      ? r.addresses_shipments_loading_address_idToaddresses
      : r.addresses_shipments_delivery_address_idToaddresses;
  const np = r.relation?.network_partner ?? null;
  return {
    id: r.id,
    shipment_number: r.shipment_number,
    status: r.status,
    transport_type: r.transport_type ?? null,
    customer_name: r.customers?.name ?? null,
    weight_kg: r.weight_kg != null ? Number(r.weight_kg) : null,
    ldm: r.ldm != null ? Number(r.ldm) : null,
    volume_m3: r.volume_m3 != null ? Number(r.volume_m3) : null,
    anchor_zip: anchorAddr?.zip ?? null,
    anchor_city: anchorAddr?.city ?? null,
    anchor_country: anchorAddr?.country_code ?? null,
    depot_id: np?.id ?? null,
    depot_name: np?.name ?? null,
    depot_number: np?.partner_number ?? null,
  };
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
