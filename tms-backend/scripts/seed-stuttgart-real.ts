/**
 * SEED SCRIPT - ECHTE STUTTGART-DATEN
 *
 * Quelle: Tagesbericht KED Stuttgart 17.03.2025 - 31.03.2026
 *
 * Inhalt:
 * - 49 echte Kunden (Bitzer, Geze, Sika, HELU, Trelleborg etc.)
 * - 53 unique Versender-Adressen
 * - 438 unique Empfaenger-Adressen
 * - 767 echte Sendungen (Pro Kunde max. 20)
 * - Status: ALLE 'new' (frisch erfasst)
 * - transport_type: SAMMELGUT 73% / DIREKT 14% / DIREKT_UMSCHLAG 12%
 *
 * IDEMPOTENT via uuid v5 (deterministische IDs aus festem Namespace)
 * DEMO-MARKER:
 *   - customer_number       startsWith 'REAL-'
 *   - shipment_number       startsWith 'REAL-'
 *   - customers.notes       enthaelt '[REAL-DATA]'
 *   - shipments.customer_note enthaelt '[REAL-DATA]'
 *
 * Schema-konform mit normalisierter addresses-Tabelle:
 *   shipments.loading_address_id  -> addresses (type=loading)
 *   shipments.delivery_address_id -> addresses (type=delivery)
 *
 * Ausfuehrung:
 *   ts-node --transpile-only scripts/seed-stuttgart-real.ts
 *
 * ENV:
 *   DATABASE_URL muss gesetzt sein (Railway oder lokal)
 *   Lookup-User: carlos@ked-global-logistics.de
 */

import { PrismaClient } from '../generated/prisma';
import { v5 as uuidv5 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const SEED_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const generateId = (entity: string, key: string): string =>
  uuidv5(`${entity}:${key}`, SEED_NS);

interface SeedData {
  customers: Array<{
    kunde_nr: string;
    name: string;
    land: string;
    plz: string;
    ort: string;
  }>;
  versender: Array<{
    name: string;
    strasse: string;
    plz: string;
    ort: string;
    land: string;
  }>;
  empfaenger: Array<{
    name: string;
    strasse: string;
    plz: string;
    ort: string;
    land: string;
  }>;
  shipments: Array<{
    auftragsnummer: string;
    sendungsdatum: string;
    leistungsdatum: string;
    kunde_nr: string;
    kunde_name: string;
    versender_name: string;
    versender_strasse: string | null;
    versender_plz: string;
    versender_ort: string;
    versender_land: string;
    empfaenger_name: string;
    empfaenger_strasse: string | null;
    empfaenger_plz: string;
    empfaenger_ort: string;
    empfaenger_land: string;
    transport_type: string;
    frankatur: string;
    colli: number;
    package_type: string;
    package_l_cm: number;
    package_w_cm: number;
    package_h_cm: number;
    gewicht_kg: number;
    gewicht_pro_stk_kg: number;
    volumen_m3: number | null;
    ldm: number | null;
    kundenreferenz: string | null;
  }>;
  meta: {
    source: string;
    total_shipments: number;
    total_customers: number;
    total_versender: number;
    total_empfaenger: number;
    note: string;
  };
}

// ===== Helpers =====

function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addrKey(name: string, plz: string, ort: string): string {
  return `${normalize(name)}|${(plz ?? '').trim()}|${normalize(ort)}`;
}

function parseDate(s: string): Date {
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    return new Date();
  }
  return d;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function mapFreightPayer(f: string): 'sender' | 'recipient' | 'third_party' {
  const v = (f ?? '').trim().toLowerCase();
  if (v.startsWith('u')) return 'recipient';
  if (v.includes('dritt') || v.includes('third')) return 'third_party';
  return 'sender';
}

function safeWeight(w: number): number {
  return !w || w <= 0 ? 100 : w;
}

// ===== Steps =====

async function loadSeedData(): Promise<SeedData> {
  const dataPath = path.join(__dirname, 'seed-data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(
      `Seed-Daten nicht gefunden: ${dataPath}\nLege seed-data.json im scripts/ Ordner ab.`,
    );
  }
  return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
}

async function findAdminUser() {
  const user = await prisma.users.findUnique({
    where: { email: 'carlos@ked-global-logistics.de' },
  });
  if (!user) {
    throw new Error(
      'User carlos@ked-global-logistics.de nicht gefunden in DB. ' +
        'Bitte zuerst Login-User anlegen.',
    );
  }
  return user;
}

async function seedCustomers(data: SeedData, createdBy: string) {
  console.log(`\n[1/3] Customers (${data.customers.length})...`);
  let ok = 0;
  let err = 0;

  for (const c of data.customers) {
    const id = generateId('customer', c.kunde_nr);
    const customer_number = `REAL-${c.kunde_nr}`;
    const notes = `[REAL-DATA] Stuttgart Tagesbericht | Excel-Nr: ${c.kunde_nr}`;
    try {
      await prisma.customers.upsert({
        where: { customer_number },
        create: {
          id,
          customer_number,
          name: c.name,
          notes,
          is_active: true,
          created_by: createdBy,
        },
        update: { name: c.name, notes },
      });
      ok++;
    } catch (e: any) {
      err++;
      if (err <= 3) console.error(`  Fehler bei Customer ${c.kunde_nr}: ${e.message}`);
    }
  }
  console.log(`  -> ${ok} angelegt/aktualisiert, ${err} Fehler`);
}

/**
 * Adressen werden ON-DEMAND beim Shipment-Loop angelegt.
 * Diese Funktion baut nur die Customer-Name-Map fuer die
 * loading-Adresse-customer_id-Verknuepfung.
 */
function buildCustomerNameMap(data: SeedData): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of data.customers) {
    map.set(normalize(c.name), generateId('customer', c.kunde_nr));
  }
  return map;
}

async function upsertAddress(args: {
  name: string;
  street: string | null;
  zip: string;
  city: string;
  country: string;
  type: 'loading' | 'delivery';
  customerId: string | null;
}) {
  const id = generateId(`address:${args.type}`, addrKey(args.name, args.zip, args.city));
  await prisma.addresses.upsert({
    where: { id },
    create: {
      id,
      type: args.type,
      name: args.name?.slice(0, 200) || 'k.A.',
      street: (args.street || 'k.A.').slice(0, 200),
      zip: (args.zip || '').slice(0, 10),
      city: (args.city || 'k.A.').slice(0, 100),
      country_code: (args.country || 'DE').slice(0, 2).toUpperCase(),
      customer_id: args.customerId,
      is_active: true,
    },
    update: {
      name: args.name?.slice(0, 200) || 'k.A.',
      street: (args.street || 'k.A.').slice(0, 200),
      zip: (args.zip || '').slice(0, 10),
      city: (args.city || 'k.A.').slice(0, 100),
      country_code: (args.country || 'DE').slice(0, 2).toUpperCase(),
      customer_id: args.customerId,
    },
  });
  return id;
}

async function seedShipments(data: SeedData, createdBy: string) {
  console.log(`\n[2/3] Shipments + Adressen (${data.shipments.length})...`);
  const customerNameMap = buildCustomerNameMap(data);
  let ok = 0;
  let err = 0;
  const seenAddr = new Set<string>();

  for (let i = 0; i < data.shipments.length; i++) {
    const s = data.shipments[i];
    const shipment_number = `REAL-${s.auftragsnummer}`;
    const id = generateId('shipment', s.auftragsnummer);
    const customer_id = generateId('customer', s.kunde_nr);

    try {
      // Versender-Adresse: customer_id setzen, falls Name matcht Customer
      const versenderCustomerId =
        customerNameMap.get(normalize(s.versender_name)) ?? null;

      const loadingKey = `loading:${addrKey(s.versender_name, s.versender_plz, s.versender_ort)}`;
      const loadingAddrId = seenAddr.has(loadingKey)
        ? generateId('address:loading', addrKey(s.versender_name, s.versender_plz, s.versender_ort))
        : await upsertAddress({
            name: s.versender_name,
            street: s.versender_strasse,
            zip: s.versender_plz,
            city: s.versender_ort,
            country: s.versender_land,
            type: 'loading',
            customerId: versenderCustomerId,
          });
      seenAddr.add(loadingKey);

      // Empfaenger-Adresse: customer_id immer NULL
      const deliveryKey = `delivery:${addrKey(s.empfaenger_name, s.empfaenger_plz, s.empfaenger_ort)}`;
      const deliveryAddrId = seenAddr.has(deliveryKey)
        ? generateId('address:delivery', addrKey(s.empfaenger_name, s.empfaenger_plz, s.empfaenger_ort))
        : await upsertAddress({
            name: s.empfaenger_name,
            street: s.empfaenger_strasse,
            zip: s.empfaenger_plz,
            city: s.empfaenger_ort,
            country: s.empfaenger_land,
            type: 'delivery',
            customerId: null,
          });
      seenAddr.add(deliveryKey);

      const loadingDate = parseDate(s.sendungsdatum);
      const deliveryDate = s.leistungsdatum
        ? parseDate(s.leistungsdatum)
        : addDays(loadingDate, 2);

      await prisma.shipments.upsert({
        where: { shipment_number },
        create: {
          id,
          shipment_number,
          customer_id,
          business_partner_id: null,
          status: 'new',
          transport_type: s.transport_type,
          freight_payer: mapFreightPayer(s.frankatur),
          loading_address_id: loadingAddrId,
          delivery_address_id: deliveryAddrId,
          loading_date: loadingDate,
          delivery_date: deliveryDate,
          weight_kg: safeWeight(s.gewicht_kg),
          package_count: s.colli || 1,
          ldm: s.ldm ?? undefined,
          volume_m3: s.volumen_m3 ?? undefined,
          package_type: (s.package_type as any) || 'pallet_euro',
          customer_ref: (s.kundenreferenz ?? s.auftragsnummer)?.slice(0, 50),
          customer_note: `[REAL-DATA] Stuttgart Tagesbericht | Frankatur: ${s.frankatur}`,
          created_by: createdBy,
        },
        update: {
          customer_id,
          loading_address_id: loadingAddrId,
          delivery_address_id: deliveryAddrId,
          loading_date: loadingDate,
          delivery_date: deliveryDate,
          weight_kg: safeWeight(s.gewicht_kg),
          package_count: s.colli || 1,
          ldm: s.ldm ?? undefined,
          volume_m3: s.volumen_m3 ?? undefined,
          customer_note: `[REAL-DATA] Stuttgart Tagesbericht (re-seeded) | Frankatur: ${s.frankatur}`,
        },
      });

      // Package-Items (1 Position pro Sendung mit line_index=1)
      const packageId = generateId('package', s.auftragsnummer);
      try {
        await prisma.shipment_package_items.upsert({
          where: { id: packageId },
          create: {
            id: packageId,
            shipment_id: id,
            line_index: 1,
            package_type: (s.package_type as any) || 'pallet_euro',
            quantity: s.colli || 1,
            length_cm: s.package_l_cm || 120,
            width_cm: s.package_w_cm || 80,
            height_cm: s.package_h_cm || 100,
            weight_kg: s.gewicht_pro_stk_kg || safeWeight(s.gewicht_kg) / Math.max(1, s.colli),
            stackable: true,
          },
          update: {},
        });
      } catch {
        // package items optional
      }

      ok++;
      if ((i + 1) % 100 === 0) {
        console.log(`  ... ${i + 1} / ${data.shipments.length}`);
      }
    } catch (e: any) {
      err++;
      if (err <= 5) {
        console.error(`  Fehler bei Shipment ${s.auftragsnummer}: ${e.message}`);
      }
    }
  }
  console.log(`  -> ${ok} angelegt, ${err} Fehler`);
}

async function summary() {
  console.log('\n=== ZUSAMMENFASSUNG ===');
  const customerCount = await prisma.customers.count({
    where: { customer_number: { startsWith: 'REAL-' } },
  });
  const shipmentCount = await prisma.shipments.count({
    where: { shipment_number: { startsWith: 'REAL-' } },
  });
  const addressCount = await prisma.addresses.count({
    where: {
      OR: [
        { customer_id: { in: await getRealCustomerIds() } },
        // delivery-Adressen ohne customer-Link bleiben hier ungezaehlt
      ],
    },
  });
  console.log(`Customers (REAL-*):   ${customerCount}`);
  console.log(`Shipments (REAL-*):   ${shipmentCount}`);
  console.log(`Adressen (Customer):  ${addressCount}`);
}

async function getRealCustomerIds(): Promise<string[]> {
  const list = await prisma.customers.findMany({
    where: { customer_number: { startsWith: 'REAL-' } },
    select: { id: true },
  });
  return list.map((x) => x.id);
}

async function main() {
  console.log('===========================================');
  console.log('SEED: ECHTE STUTTGART-DATEN');
  console.log('===========================================');

  const data = await loadSeedData();
  console.log(`\nQuelle: ${data.meta.source}`);
  console.log(
    `${data.meta.total_shipments} Sendungen, ${data.meta.total_customers} Kunden`,
  );

  const adminUser = await findAdminUser();
  console.log(`Created by: ${adminUser.email} (${adminUser.id})`);

  await seedCustomers(data, adminUser.id);
  await seedShipments(data, adminUser.id);
  await summary();

  console.log('\n===========================================');
  console.log('FERTIG');
  console.log('===========================================');
}

main()
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
