/**
 * 1) Routing: Nahverkehrsgebiet DE als INBOUND OWN_NV — PLZ mit Zentroid ≤ 50 km um
 *    Motorstraße 7, 70499 Stuttgart (Weilimdorf), Datenquelle OpenDataSoft GeoNames PLZ.
 *    Es entstehen viele Routing-Zeilen (numerisch zusammenhängende PLZ-Bereiche), das ist beabsichtigt.
 *    Wiederholtes Ausführen: alte NV-Regeln gleichen Namens werden gelöscht (Sendungs-FK wird vorher geleert).
 * 2) Ein Demo-Kunde, 20 Ladestellen im NV-Gebiet, 30 UK-Empfangsadressen, 20 Sendungen DE → UK
 *    (jeweils andere UK-Stadt aus den ersten 20 der 30 Orte).
 *
 * Ausführung (tms-backend, DATABASE_URL in .env):
 *   npx ts-node --transpile-only scripts/seed-stuttgart-uk-demo.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

/** Referenzpunkt Motorstraße 7, 70499 Stuttgart-Weilimdorf */
const CENTER_LAT = 48.82497;
const CENTER_LON = 9.0986075;
const RADIUS_KM = 50;

const NV_RULE_PREFIX = 'NV Stuttgart Motor.7';

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function padPlz(n: number): string {
  return String(n).padStart(5, '0');
}

function mergeConsecutivePlz(codes: string[]): { zip_from: string; zip_to: string }[] {
  const nums = [
    ...new Set(
      codes
        .map((c) => Number(String(c).replace(/\s/g, '')))
        .filter((n) => Number.isFinite(n) && n >= 1000 && n <= 99999),
    ),
  ].sort((a, b) => a - b);
  if (nums.length === 0) return [];
  const ranges: { zip_from: string; zip_to: string }[] = [];
  let start = nums[0];
  let end = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const n = nums[i];
    if (n === end + 1) {
      end = n;
    } else {
      ranges.push({ zip_from: padPlz(start), zip_to: padPlz(end) });
      start = end = n;
    }
  }
  ranges.push({ zip_from: padPlz(start), zip_to: padPlz(end) });
  return ranges;
}

type OdsRecord = {
  postal_code: string;
  place_name?: string;
  admin_name3?: string;
  latitude: number;
  longitude: number;
};

async function fetchDePlzNearStuttgart(): Promise<{
  inRadius: Set<string>;
  plzCity: Map<string, string>;
}> {
  const inRadius = new Set<string>();
  const plzCity = new Map<string, string>();
  const where = encodeURIComponent(
    `country_code="DE" and latitude >= 48.20 and latitude <= 49.55 and longitude >= 8.00 and longitude <= 10.20`,
  );
  const limit = 100;
  let offset = 0;
  for (;;) {
    const url = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames-postal-code/records?where=${where}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OpenDataSoft HTTP ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { results?: OdsRecord[] };
    const rows = json.results ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      const plz = String(r.postal_code ?? '')
        .trim()
        .replace(/\s/g, '');
      if (!/^\d{5}$/.test(plz)) continue;
      const d = haversineKm(CENTER_LAT, CENTER_LON, r.latitude, r.longitude);
      if (d > RADIUS_KM) continue;
      inRadius.add(plz);
      if (!plzCity.has(plz)) {
        const city = (r.admin_name3 || r.place_name || 'Unbekannt').slice(0, 100);
        plzCity.set(plz, city);
      }
    }
    offset += limit;
    if (rows.length < limit) break;
  }
  return { inRadius, plzCity };
}

async function nextShipmentNumber(prisma: PrismaClient): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('shipment_number_seq')
  `;
  const year = new Date().getFullYear().toString().slice(-2);
  return `S${year}-${result[0].nextval.toString().padStart(6, '0')}`;
}

async function nextCustomerNumber(prisma: PrismaClient): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('customer_number_seq')
  `;
  return `C${result[0].nextval.toString().padStart(5, '0')}`;
}

function timeOnDate(h: number, m: number): Date {
  return new Date(Date.UTC(1970, 0, 1, h, m, 0, 0));
}

/** 30 Orte UK (erste 20 werden für die 20 Sendungen verwendet). */
const UK_DESTINATIONS: { zip: string; city: string; street: string; name: string }[] = [
  { zip: 'SW1A 1AA', city: 'London', street: 'Parliament Street 1', name: 'London Central Receiving Ltd' },
  { zip: 'B1 1AA', city: 'Birmingham', street: 'Corporation Street 1', name: 'Birmingham Central Logistics Ltd' },
  { zip: 'M1 1AD', city: 'Manchester', street: 'Piccadilly 12', name: 'Manchester Freight Hub' },
  { zip: 'G1 1XQ', city: 'Glasgow', street: 'George Square 5', name: 'Scotland Cargo Ltd' },
  { zip: 'EH1 1YZ', city: 'Edinburgh', street: 'High Street 44', name: 'Capital Scotland Freight' },
  { zip: 'LS1 4DY', city: 'Leeds', street: 'The Headrow 25', name: 'Yorkshire Distribution Ltd' },
  { zip: 'L1 8JQ', city: 'Liverpool', street: 'Water Street 20', name: 'Mersey Logistics PLC' },
  { zip: 'NE1 4ST', city: 'Newcastle', street: 'Grey Street 15', name: 'Tyne Express Ltd' },
  { zip: 'S1 2HE', city: 'Sheffield', street: 'Fargate 8', name: 'Sheffield Steel Transport' },
  { zip: 'BS1 5TR', city: 'Bristol', street: 'Broad Quay 3', name: 'Southwest Hub Ltd' },
  { zip: 'CF10 1EP', city: 'Cardiff', street: 'St Mary Street 9', name: 'Wales Link Logistics' },
  { zip: 'BT1 5GS', city: 'Belfast', street: 'Donegall Square W 2', name: 'Northern Ireland Cargo' },
  { zip: 'NG1 5FS', city: 'Nottingham', street: 'Wheeler Gate 7', name: 'East Midlands Express' },
  { zip: 'SO14 0AA', city: 'Southampton', street: 'Above Bar Street 11', name: 'South Coast Shipping' },
  { zip: 'BN1 1AE', city: 'Brighton', street: 'North Street 22', name: 'Channel Logistics Ltd' },
  { zip: 'PL1 2AA', city: 'Plymouth', street: 'Royal Parade 6', name: 'Devon & Cornwall Freight' },
  { zip: 'LE1 5WW', city: 'Leicester', street: 'Granby Street 14', name: 'Leicester Midlink Ltd' },
  { zip: 'CV1 2GT', city: 'Coventry', street: 'Broadgate 18', name: 'Midlands Automotive Logistics' },
  { zip: 'HU1 1JU', city: 'Hull', street: 'Whitefriargate 5', name: 'Humber Ports Ltd' },
  { zip: 'ST1 1JP', city: 'Stoke-on-Trent', street: 'Piccadilly 30', name: 'Potteries Distribution' },
  { zip: 'WV1 1SH', city: 'Wolverhampton', street: 'Lichfield Street 12', name: 'Black Country Freight' },
  { zip: 'DE1 3AE', city: 'Derby', street: 'Victoria Street 8', name: 'Derby Rail Link Ltd' },
  { zip: 'AB10 1XG', city: 'Aberdeen', street: 'Union Street 100', name: 'North Sea Logistics' },
  { zip: 'SA1 1AA', city: 'Swansea', street: 'Wind Street 4', name: 'Welsh Coast Cargo' },
  { zip: 'OX1 1HS', city: 'Oxford', street: 'High Street 50', name: 'Oxford Science Park Freight' },
  { zip: 'CB1 1PT', city: 'Cambridge', street: 'Sidney Street 16', name: 'Cambridge Tech Logistics' },
  { zip: 'YO1 6GA', city: 'York', street: 'Coney Street 21', name: 'Vale of York Transport' },
  { zip: 'NR1 3PN', city: 'Norwich', street: 'Castle Meadow 3', name: 'Norfolk Broads Freight' },
  { zip: 'IP1 1AA', city: 'Ipswich', street: 'Princes Street 9', name: 'Suffolk East Logistics' },
  { zip: 'BH1 1QE', city: 'Bournemouth', street: 'Old Christchurch Road 40', name: 'South Coast Express' },
];

function pickLoadingPlz(
  sortedPlz: string[],
  plzCity: Map<string, string>,
  count: number,
): { zip: string; city: string }[] {
  const out: { zip: string; city: string }[] = [];
  if (sortedPlz.length === 0) throw new Error('Keine PLZ im 50-km-Gebiet gefunden.');
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let idx = Math.min(
      sortedPlz.length - 1,
      Math.floor((i * sortedPlz.length) / count),
    );
    let zip = sortedPlz[idx];
    let guard = 0;
    while (used.has(zip) && guard < sortedPlz.length) {
      idx = (idx + 1) % sortedPlz.length;
      zip = sortedPlz[idx];
      guard++;
    }
    used.add(zip);
    out.push({ zip, city: plzCity.get(zip) || 'Stuttgart Region' });
  }
  return out;
}

function findRangeRuleId(
  zip: string,
  rules: { id: string; zip_from: string; zip_to: string }[],
): string | null {
  const n = Number(zip.replace(/\s/g, ''));
  if (!Number.isFinite(n)) return null;
  for (const r of rules) {
    const a = Number(r.zip_from);
    const b = Number(r.zip_to);
    if (a <= n && n <= b) return r.id;
  }
  return null;
}

async function main() {
  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL fehlt (z. B. in .env im Ordner tms-backend).');
  }

  // eslint-disable-next-line no-console
  console.log('Lade DE-PLZ aus OpenDataSoft (Bounding Box) und filtere ≤ 50 km …');
  const { inRadius, plzCity } = await fetchDePlzNearStuttgart();
  const sortedPlz = [...inRadius].sort((a, b) => Number(a) - Number(b));
  // eslint-disable-next-line no-console
  console.log(`  → ${sortedPlz.length} PLZ innerhalb ${RADIUS_KM} km.`);

  const ranges = mergeConsecutivePlz(sortedPlz);
  // eslint-disable-next-line no-console
  console.log(`  → ${ranges.length} zusammenhängende PLZ-Bereiche für Routing.`);

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const user = await prisma.users.findFirst({ where: { email: 'admin@tms.local' } });
  if (!user) {
    throw new Error('Benutzer admin@tms.local nicht gefunden.');
  }

  const oldNv = await prisma.routing_rules.findMany({
    where: { rule_name: { startsWith: NV_RULE_PREFIX } },
    select: { id: true },
  });
  const oldNvIds = oldNv.map((r) => r.id);
  if (oldNvIds.length > 0) {
    await prisma.shipments.updateMany({
      where: { inbound_routing_id: { in: oldNvIds } },
      data: { inbound_routing_id: null },
    });
  }
  const deleted = await prisma.routing_rules.deleteMany({
    where: { rule_name: { startsWith: NV_RULE_PREFIX } },
  });
  // eslint-disable-next-line no-console
  console.log(`Alte NV-Regeln entfernt: ${deleted.count}`);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const createdRules: { id: string; zip_from: string; zip_to: string }[] = [];
  let ri = 0;
  for (const r of ranges) {
    const row = await prisma.routing_rules.create({
      data: {
        rule_name: `${NV_RULE_PREFIX} ${++ri} (${r.zip_from}–${r.zip_to})`,
        direction: 'INBOUND',
        country_code: 'DE',
        zip_from: r.zip_from,
        zip_to: r.zip_to,
        zip_prefix: null,
        delivery_type: 'OWN_NV',
        partner_id: null,
        partner_name: null,
        gateway_name: null,
        gateway_zip: null,
        gateway_city: null,
        gateway_country: null,
        transit_days: 0,
        priority: 500,
        departure_days: null,
        departure_time: null,
        cutoff_time: null,
        hall_location_id: null,
        is_active: true,
        valid_from: today,
        valid_to: null,
      },
    });
    createdRules.push({ id: row.id, zip_from: r.zip_from, zip_to: r.zip_to });
  }
  // eslint-disable-next-line no-console
  console.log(`Angelegt: ${createdRules.length} INBOUND OWN_NV Routing-Regeln (DE).`);

  const outboundGb = await prisma.routing_rules.findFirst({
    where: { country_code: 'GB', is_active: true, direction: { in: ['OUTBOUND', 'BOTH'] } },
    orderBy: { priority: 'desc' },
  });

  const stamp = Date.now().toString(36).toUpperCase();
  const customerNumber = await nextCustomerNumber(prisma);
  const customer = await prisma.customers.create({
    data: {
      customer_number: customerNumber,
      name: `UK-Export Demo (${stamp})`,
      name2: 'NV Stuttgart → UK · Seed',
      payment_term_days: 30,
      default_incoterm: 'DAP',
      invoice_email: `uk-demo-${stamp}@example.com`,
      notes: `Demo: 20 Sendungen aus NV-Gebiet (≤50 km Motor.7), 30 UK-Empfangsadressen.`,
      created_by: user.id,
    },
  });

  const loadingPoints = pickLoadingPlz(sortedPlz, plzCity, 20);
  const loadingAddrs: { id: string; zip: string; city: string }[] = [];

  for (let i = 0; i < loadingPoints.length; i++) {
    const lp = loadingPoints[i];
    const addr = await prisma.addresses.create({
      data: {
        customer_id: customer.id,
        type: 'loading',
        name: `Ladestelle ${i + 1} · ${lp.city}`,
        name2: `Ref ${stamp}-${i + 1}`,
        street: `Gewerbestraße ${(i + 1) * 3}`,
        zip: lp.zip,
        city: lp.city,
        country_code: 'DE',
        contact_name: `Werksleitung ${i + 1}`,
        contact_phone: `+49 711 ${3000000 + i}`,
        contact_email: `loading.ukdemo${i + 1}@example.com`,
        notes: `NV-Gebiet: PLZ ${lp.zip} (≤ ${RADIUS_KM} km um Motorstraße 7, 70499 Stuttgart).`,
      },
    });
    loadingAddrs.push({ id: addr.id, zip: lp.zip, city: lp.city });
  }

  const ukAddrs: { id: string; city: string; zip: string }[] = [];
  for (let j = 0; j < UK_DESTINATIONS.length; j++) {
    const u = UK_DESTINATIONS[j];
    const addr = await prisma.addresses.create({
      data: {
        customer_id: customer.id,
        type: 'delivery',
        name: u.name,
        name2: `UK Ort ${j + 1}/${UK_DESTINATIONS.length}`,
        street: u.street,
        zip: u.zip,
        city: u.city,
        country_code: 'GB',
        contact_name: `Goods In · ${u.city}`,
        contact_phone: `+44 20 ${7000000 + j}`,
        contact_email: `receiving.${u.city.toLowerCase().replace(/[^a-z]/g, '')}@example.co.uk`,
        notes: 'Seed UK-Empfang.',
      },
    });
    ukAddrs.push({ id: addr.id, city: u.city, zip: u.zip });
  }

  const loadingDate = new Date();
  loadingDate.setUTCHours(0, 0, 0, 0);
  const deliveryDate = new Date(loadingDate);
  deliveryDate.setUTCDate(deliveryDate.getUTCDate() + 4);

  const createdShipments: string[] = [];

  for (let i = 0; i < 20; i++) {
    const load = loadingAddrs[i];
    const uk = ukAddrs[i];
    const inboundId = findRangeRuleId(load.zip, createdRules);
    const shipmentNumber = await nextShipmentNumber(prisma);
    await prisma.shipments.create({
      data: {
        shipment_number: shipmentNumber,
        customer_id: customer.id,
        customer_ref: `PO-UK-${stamp}-${i + 1}`,
        status: 'new',
        loading_address_id: load.id,
        delivery_address_id: uk.id,
        loading_date: loadingDate,
        loading_time_from: timeOnDate(8 + (i % 4), 0),
        loading_time_to: timeOnDate(12 + (i % 3), 30),
        delivery_date: deliveryDate,
        delivery_time_from: timeOnDate(9, 0),
        delivery_time_to: timeOnDate(16, 0),
        package_type: 'pallet_euro',
        package_count: 2 + (i % 6),
        weight_kg: 620 + i * 95,
        ldm: 3.2 + i * 0.2,
        incoterm: 'DAP',
        freight_payer: i % 2 === 0 ? 'sender' : 'recipient',
        transport_type: 'DIREKT',
        comment: `Seed: ${load.city} (${load.zip}) → ${uk.city} (${uk.zip}).`,
        created_by: user.id,
        freight_revenue: 520 + i * 40,
        inbound_routing_id: inboundId,
        outbound_routing_id: outboundGb?.id ?? null,
        inbound_delivery_type: 'OWN_NV',
        outbound_delivery_type: outboundGb?.delivery_type ?? 'CHARTER',
        inbound_partner_name: null,
        outbound_partner_name: outboundGb?.partner_name ?? null,
      },
    });
    createdShipments.push(`${shipmentNumber}  ${load.city} → ${uk.city}`);
  }

  await prisma.$disconnect();
  await pool.end();

  // eslint-disable-next-line no-console
  console.log('\nKunde:', customer.customer_number, customer.name);
  // eslint-disable-next-line no-console
  console.log('Ladestellen:', loadingAddrs.length, '| UK-Empfangsadressen:', ukAddrs.length, '| Sendungen:', createdShipments.length);
  for (const line of createdShipments) {
    // eslint-disable-next-line no-console
    console.log(' •', line);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
