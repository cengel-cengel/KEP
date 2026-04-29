/**
 * 10 Kunden (DE-Ladestelle) + 10 Sendungen nach Italien (jeweils andere IT-PLZ, nie IE).
 * Alle in der Erfassung üblichen Felder werden gesetzt.
 *
 * Ausführung (tms-backend, DATABASE_URL in .env):
 *   npx ts-node --transpile-only scripts/seed-it-shipments.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

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

async function nextCustomerNumber(prisma: PrismaClient): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('customer_number_seq')
  `;
  return `C${result[0].nextval.toString().padStart(5, '0')}`;
}

async function nextShipmentNumber(prisma: PrismaClient): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('shipment_number_seq')
  `;
  const year = new Date().getFullYear().toString().slice(-2);
  return `S${year}-${result[0].nextval.toString().padStart(6, '0')}`;
}

const IT_DESTINATIONS = [
  { zip: '00184', city: 'Roma', street: 'Via Nazionale 45', name: 'Empfänger Roma Nord Srl' },
  { zip: '20121', city: 'Milano', street: 'Via Dante 12', name: 'Logistica Milano SpA' },
  { zip: '80138', city: 'Napoli', street: 'Via Toledo 88', name: 'Sud Italia Cargo Srl' },
  { zip: '50132', city: 'Firenze', street: 'Viale Spartaco Lavagnini 20', name: 'Toscana Fracht GmbH' },
  { zip: '10123', city: 'Torino', street: 'Via Roma 100', name: 'Piemonte Hub Srl' },
  { zip: '40121', city: 'Bologna', street: 'Via Indipendenza 15', name: 'Emilia Transport Srl' },
  { zip: '16129', city: 'Genova', street: 'Via XX Settembre 35', name: 'Liguria Marittima SpA' },
  { zip: '90133', city: 'Palermo', street: 'Via Maqueda 50', name: 'Sicilia Logistica Srl' },
  { zip: '43121', city: 'Parma', street: 'Strada della Repubblica 8', name: 'Parma Food Logistics' },
  { zip: '35131', city: 'Padova', street: 'Via del Santo 22', name: 'Veneto Express Srl' },
] as const;

const DE_LOADING = [
  { zip: '10115', city: 'Berlin', street: 'Friedrichstraße 100', lat: 52.52, lng: 13.405 },
  { zip: '20095', city: 'Hamburg', street: 'Mönckebergstraße 7', lat: 53.5511, lng: 9.9937 },
  { zip: '80331', city: 'München', street: 'Sendlinger Straße 32', lat: 48.1351, lng: 11.582 },
  { zip: '50667', city: 'Köln', street: 'Hohe Straße 52', lat: 50.9375, lng: 6.9603 },
  { zip: '70173', city: 'Stuttgart', street: 'Königstraße 28', lat: 48.7758, lng: 9.1829 },
  { zip: '40213', city: 'Düsseldorf', street: 'Königsallee 15', lat: 51.2277, lng: 6.7735 },
  { zip: '04103', city: 'Leipzig', street: 'Grimmaische Straße 14', lat: 51.3397, lng: 12.3731 },
  { zip: '01067', city: 'Dresden', street: 'Prager Straße 8', lat: 51.0504, lng: 13.7373 },
  { zip: '30159', city: 'Hannover', street: 'Georgstraße 42', lat: 52.3759, lng: 9.732 },
  { zip: '90402', city: 'Nürnberg', street: 'Königstraße 60', lat: 49.4521, lng: 11.0767 },
] as const;

const PACKAGE_ROTATION = [
  'pallet_euro',
  'pallet_one_way',
  'box',
  'drum',
  'bulk',
  'coil',
  'container',
  'other',
  'pallet_euro',
  'box',
] as const;

const TRANSPORT_ROTATION = [
  'DIREKT',
  'SAMMELGUT',
  'DIREKT_UMSCHLAG',
  'BEILADER',
  'DIREKT',
  'SAMMELGUT',
  'SONDER',
  'DIREKT',
  'ABHOLUNG_UMSCHLAG',
  'DIREKT',
] as const;

function timeOnDate(h: number, m: number): Date {
  return new Date(Date.UTC(1970, 0, 1, h, m, 0, 0));
}

async function main() {
  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL fehlt (z. B. in .env im Ordner tms-backend).');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const user = await prisma.users.findFirst({ where: { email: 'admin@tms.local' } });
  if (!user) {
    throw new Error('Benutzer admin@tms.local nicht gefunden.');
  }

  const stamp = Date.now().toString(36).toUpperCase();
  const loadingDate = new Date();
  loadingDate.setUTCHours(0, 0, 0, 0);
  const deliveryDate = new Date(loadingDate);
  deliveryDate.setUTCDate(deliveryDate.getUTCDate() + 3);

  const created: { customer: string; shipment: string; itZip: string }[] = [];

  for (let i = 0; i < 10; i++) {
    const it = IT_DESTINATIONS[i];
    const de = DE_LOADING[i];
    const pkg = PACKAGE_ROTATION[i];
    const transport = TRANSPORT_ROTATION[i];

    const customerNumber = await nextCustomerNumber(prisma);
    const customer = await prisma.customers.create({
      data: {
        customer_number: customerNumber,
        name: `IT-Seed Kunde ${i + 1} (${stamp})`,
        name2: `Abteilung Export / Ref ${stamp}-${i + 1}`,
        vat_id: `DE${300000000 + i}`,
        payment_term_days: 14 + i,
        credit_limit: 25000 + i * 1000,
        datev_account: `${4200 + i}`,
        default_incoterm: i % 2 === 0 ? 'DAP' : 'CPT',
        invoice_email: `buchhaltung.itseed${i + 1}@example.com`,
        edi_partner_id: `EDI-IT-${stamp}-${i + 1}`,
        min_contribution_pct: 12 + (i % 5),
        notes: `Seed: Sendungen nach Italien (${it.city}, CAP ${it.zip}). Kein Ziel Irland.`,
        created_by: user.id,
      },
    });

    const loadingAddr = await prisma.addresses.create({
      data: {
        customer_id: customer.id,
        type: 'loading',
        name: `Lager / Werk ${de.city} – ${customer.name}`,
        name2: `Tor ${i + 1} · Rampen A–D`,
        street: de.street,
        zip: de.zip,
        city: de.city,
        country_code: 'DE',
        contact_name: `Lagerleiter ${de.city}`,
        contact_phone: `+49 30 ${2000000 + i}`,
        contact_email: `loading.itseed${i + 1}@example.com`,
        notes: 'Bitte 24h vorher anmelden. Nur werktags 07–18 Uhr.',
        lat: de.lat,
        lng: de.lng,
        opening_hours: {
          mon: '07:00-18:00',
          tue: '07:00-18:00',
          wed: '07:00-18:00',
          thu: '07:00-18:00',
          fri: '07:00-16:00',
        } as object,
      },
    });

    const deliveryAddr = await prisma.addresses.create({
      data: {
        customer_id: customer.id,
        type: 'delivery',
        name: it.name,
        name2: `Zweigstelle ${it.city}`,
        street: it.street,
        zip: it.zip,
        city: it.city,
        country_code: 'IT',
        contact_name: `Sign. Rossi / Slot ${i + 1}`,
        contact_phone: `+39 02 ${3000000 + i}`,
        contact_email: `dock.${it.city.toLowerCase()}@example.it`,
        notes: 'Zustellung nur werktags; Avis erforderlich.',
        lat: 41.9 + i * 0.15,
        lng: 12.5 + i * 0.2,
      },
    });

    const shipmentNumber = await nextShipmentNumber(prisma);
    const weightKg = 850 + i * 120;
    const ldm = 4 + i * 0.35;
    const lengthCm = 120 + i * 5;
    const widthCm = 80 + i * 2;
    const heightCm = 100 + i * 3;
    const volumeM3 = (lengthCm * widthCm * heightCm * (1 + i)) / 1_000_000;
    const isHazmat = i === 4;

    const shipment = await prisma.shipments.create({
      data: {
        shipment_number: shipmentNumber,
        customer_id: customer.id,
        customer_ref: `PO-IT-${stamp}-${i + 1}`,
        status: 'new',
        loading_address_id: loadingAddr.id,
        delivery_address_id: deliveryAddr.id,
        loading_date: loadingDate,
        loading_time_from: timeOnDate(7 + (i % 3), 30),
        loading_time_to: timeOnDate(11 + (i % 2), 0),
        delivery_date: deliveryDate,
        delivery_time_from: timeOnDate(8, 0),
        delivery_time_to: timeOnDate(17, 30),
        package_type: pkg as any,
        package_count: 3 + i,
        weight_kg: weightKg,
        ldm,
        volume_m3: volumeM3,
        length_cm: lengthCm,
        width_cm: widthCm,
        height_cm: heightCm,
        is_hazmat: isHazmat,
        hazmat_class: isHazmat ? '3' : null,
        hazmat_un_number: isHazmat ? '1203' : null,
        hazmat_packing_group: isHazmat ? 'II' : null,
        hazmat_description: isHazmat ? 'Benzin, entzündlich (Demo-Seed)' : null,
        incoterm: customer.default_incoterm ?? 'DAP',
        freight_payer: i % 3 === 0 ? 'recipient' : 'sender',
        transport_type: transport,
        comment: `Seed Sendung ${i + 1}: DE ${de.city} → IT ${it.city} (${it.zip}). Exportpapier bitte beifügen.`,
        customer_note: `Abladestelle: Hintere Rampe. Ansprechpartner vor Ort nennen.`,
        delivery_note_number: `DN-IT-${stamp}-${i + 1}`,
        edi_source: 'SEED_SCRIPT',
        edi_reference: `REF-IT-${stamp}-${i + 1}`,
        chargeable_weight: weightKg * 1.02,
        cbm: volumeM3,
        volume_weight_cbm: volumeM3 * 333,
        volume_weight_ldm: ldm * 1850,
        fpg_method: i % 2 === 0 ? 'MAX' : 'KG',
        inbound_delivery_type: 'DIRECT',
        outbound_delivery_type: 'LINEHAUL',
        inbound_partner_name: `NV Inbound ${de.city}`,
        outbound_partner_name: `Partner IT ${it.city}`,
        created_by: user.id,
        freight_revenue: 450 + i * 75,
      },
    });

    created.push({
      customer: `${customer.customer_number} ${customer.name}`,
      shipment: shipment.shipment_number,
      itZip: it.zip,
    });
  }

  await prisma.$disconnect();
  await pool.end();

  // eslint-disable-next-line no-console
  console.log('Angelegt: 10 Kunden mit Ladestelle (DE) + 10 Sendungen nach Italien (verschiedene CAP, country IT):');
  for (const row of created) {
    // eslint-disable-next-line no-console
    console.log(`  • ${row.shipment} → IT ${row.itZip} | ${row.customer}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
