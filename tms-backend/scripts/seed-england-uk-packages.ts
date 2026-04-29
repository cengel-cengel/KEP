/**
 * England Logistics (Netzpartner) + Relation DE→GB (ganz UK via zip_mapping mit leerem Prefix)
 * + Kostensätze Vorlauf/Hauptlauf/Nachlauf an der Relation
 * + 5 Sendungen nach UK mit je 5 Packstück-Zeilen (Maße, Stapelbarkeit), FPG & Tarifkosten wie applyRelationTariffEconomics.
 *
 *   npx ts-node --transpile-only scripts/seed-england-uk-packages.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';
import type { package_type } from '../generated/prisma/client';
import {
  aggregatePackageLines,
  calculateChargeableWeightFromAggregates,
  type PackageLineInput,
} from '../src/costs/freight-weight.calculator';

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

function legCost(cw: number, ratePer100: number, minCharge: number): number {
  const raw = Math.round((cw / 100) * ratePer100 * 100) / 100;
  return Math.round(Math.max(raw, minCharge) * 100) / 100;
}

type PkgLine = PackageLineInput & { package_type: package_type };

const RATES = {
  prePer100: 11.5,
  preMin: 48,
  mainPer100: 26.0,
  mainMin: 115,
  onPer100: 7.25,
  onMin: 32,
};

const UK_STOPS: {
  zip: string;
  city: string;
  street: string;
  name: string;
  lat: number;
  lng: number;
}[] = [
  { zip: 'SW1A 1AA', city: 'London', street: 'Parliament Street 1', name: 'London Central Receiving Ltd', lat: 51.5074, lng: -0.1278 },
  { zip: 'B1 1AA', city: 'Birmingham', street: 'Corporation Street 1', name: 'Birmingham Central Logistics Ltd', lat: 52.4862, lng: -1.8904 },
  { zip: 'M1 1AD', city: 'Manchester', street: 'Piccadilly 12', name: 'Manchester Freight Hub', lat: 53.4808, lng: -2.2426 },
  { zip: 'G1 1XQ', city: 'Glasgow', street: 'George Square 5', name: 'Scotland Cargo Ltd', lat: 55.8642, lng: -4.2518 },
  { zip: 'EH1 1YZ', city: 'Edinburgh', street: 'High Street 44', name: 'Capital Scotland Freight', lat: 55.9533, lng: -3.1883 },
];

/** Je Sendung 5 Zeilen: unterschiedliche Typen, Maße, Stapelbarkeit (weight_kg = Gesamtgewicht der Zeile). */
const SHIPMENT_LINES: PkgLine[][] = [
  [
    { package_type: 'pallet_euro', quantity: 2, length_cm: 120, width_cm: 80, height_cm: 100, weight_kg: 420, stackable: true },
    { package_type: 'pallet_one_way', quantity: 1, length_cm: 120, width_cm: 100, height_cm: 160, weight_kg: 380, stackable: false },
    { package_type: 'box', quantity: 8, length_cm: 60, width_cm: 40, height_cm: 35, weight_kg: 96, stackable: true },
    { package_type: 'drum', quantity: 4, length_cm: 58, width_cm: 58, height_cm: 88, weight_kg: 220, stackable: false },
    { package_type: 'pallet_euro', quantity: 1, length_cm: 120, width_cm: 80, height_cm: 195, weight_kg: 310, stackable: true },
  ],
  [
    { package_type: 'box', quantity: 12, length_cm: 50, width_cm: 40, height_cm: 30, weight_kg: 144, stackable: true },
    { package_type: 'pallet_euro', quantity: 3, length_cm: 120, width_cm: 80, height_cm: 85, weight_kg: 540, stackable: true },
    { package_type: 'coil', quantity: 2, length_cm: 110, width_cm: 110, height_cm: 75, weight_kg: 890, stackable: false },
    { package_type: 'other', quantity: 1, length_cm: 200, width_cm: 80, height_cm: 60, weight_kg: 175, stackable: false },
    { package_type: 'pallet_one_way', quantity: 2, length_cm: 100, width_cm: 120, height_cm: 140, weight_kg: 410, stackable: true },
  ],
  [
    { package_type: 'container', quantity: 1, length_cm: 235, width_cm: 90, height_cm: 90, weight_kg: 1200, stackable: false },
    { package_type: 'pallet_euro', quantity: 4, length_cm: 120, width_cm: 80, height_cm: 95, weight_kg: 720, stackable: true },
    { package_type: 'box', quantity: 6, length_cm: 80, width_cm: 60, height_cm: 50, weight_kg: 180, stackable: true },
    { package_type: 'bulk', quantity: 1, length_cm: 100, width_cm: 100, height_cm: 120, weight_kg: 450, stackable: false },
    { package_type: 'drum', quantity: 6, length_cm: 60, width_cm: 60, height_cm: 90, weight_kg: 330, stackable: true },
  ],
  [
    { package_type: 'pallet_euro', quantity: 1, length_cm: 120, width_cm: 80, height_cm: 220, weight_kg: 195, stackable: false },
    { package_type: 'box', quantity: 20, length_cm: 40, width_cm: 30, height_cm: 25, weight_kg: 100, stackable: true },
    { package_type: 'pallet_one_way', quantity: 3, length_cm: 120, width_cm: 100, height_cm: 110, weight_kg: 660, stackable: true },
    { package_type: 'other', quantity: 2, length_cm: 150, width_cm: 70, height_cm: 90, weight_kg: 240, stackable: false },
    { package_type: 'pallet_euro', quantity: 2, length_cm: 120, width_cm: 80, height_cm: 100, weight_kg: 520, stackable: true },
  ],
  [
    { package_type: 'box', quantity: 24, length_cm: 45, width_cm: 35, height_cm: 28, weight_kg: 168, stackable: true },
    { package_type: 'pallet_euro', quantity: 5, length_cm: 120, width_cm: 80, height_cm: 78, weight_kg: 950, stackable: true },
    { package_type: 'drum', quantity: 8, length_cm: 55, width_cm: 55, height_cm: 85, weight_kg: 400, stackable: false },
    { package_type: 'coil', quantity: 1, length_cm: 125, width_cm: 125, height_cm: 80, weight_kg: 780, stackable: false },
    { package_type: 'pallet_one_way', quantity: 1, length_cm: 120, width_cm: 100, height_cm: 175, weight_kg: 295, stackable: true },
  ],
];

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

  const SEED_COMMENT_PREFIX = 'Seed England Logistics:';
  const BP_NAME = 'England Logistics Ltd';
  const RELATION_NAME = 'England Logistics UK';
  const CUSTOMER_NAME2 = 'England Logistics · 5×5 Zeilen';

  // Cleanup: nur die von diesem Script erzeugten Sendungen löschen,
  // damit wiederholtes Seeden nicht die Karte/Disposition verdreht.
  await prisma.shipments.deleteMany({
    where: { comment: { startsWith: SEED_COMMENT_PREFIX } as any },
  });

  const stamp = Date.now().toString(36).toUpperCase();

  const englandLogistics = await prisma.business_partners.findFirst({
    where: { name: BP_NAME, country_code: 'GB' },
  });

  const englandLogisticsId =
    englandLogistics?.id ??
    (
      await prisma.business_partners.create({
        data: {
          partner_number: `EL-${stamp}`.slice(0, 20),
          partner_type: 'CARRIER',
          name: BP_NAME,
          name2: 'UK linehaul & distribution',
          street: 'Industrial Way 12',
          zip: 'UB7 0GA',
          city: 'West Drayton',
          country_code: 'GB',
          vat_id: 'GB123456789',
          is_active: true,
        },
      })
    ).id;

  const relation = await prisma.relations.findFirst({
    where: { name: RELATION_NAME, country_to: 'GB', direction: 'OUTBOUND' },
    orderBy: { created_at: 'desc' },
  });

  const relationId =
    relation?.id ??
    (
      await prisma.relations.create({
        data: {
          code: `GB_EL_${stamp}`.slice(0, 20),
          name: RELATION_NAME,
          direction: 'OUTBOUND',
          country_from: 'DE',
          country_to: 'GB',
          network_partner_id: englandLogisticsId,
          transit_days: 3,
          departure_days: 'MON,TUE,WED,THU,FRI',
          is_active: true,
        },
      })
    ).id;

  // Ensure cost rates + zip mapping match the demo expectations.
  await prisma.cost_rates.deleteMany({ where: { relation_id: relationId } });
  await prisma.zip_relation_mapping.deleteMany({ where: { relation_id: relationId } });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.cost_rates.createMany({
    data: [
      {
        rate_type: 'PRE_CARRIAGE',
        name: `Vorlauf DE-Werk (${relation?.code ?? 'GB_EL'})`,
        relation_id: relationId,
        rate_per_100kg: RATES.prePer100,
        min_charge: RATES.preMin,
        valid_from: today,
        is_active: true,
      },
      {
        rate_type: 'MAIN_CARRIAGE',
        name: `Hauptlauf DE→GB (${relation?.code ?? 'GB_EL'})`,
        relation_id: relationId,
        rate_per_100kg: RATES.mainPer100,
        min_charge: RATES.mainMin,
        valid_from: today,
        is_active: true,
      },
      {
        rate_type: 'ON_CARRIAGE',
        name: `Nachlauf GB (${relation?.code ?? 'GB_EL'})`,
        relation_id: relationId,
        rate_per_100kg: RATES.onPer100,
        min_charge: RATES.onMin,
        valid_from: today,
        is_active: true,
      },
    ],
  });

  await prisma.zip_relation_mapping.create({
    data: {
      zip_prefix: '',
      country_code: 'GB',
      relation_id: relationId,
      priority: 500,
    },
  });

  let customer = await prisma.customers.findFirst({
    where: { name2: CUSTOMER_NAME2 },
    orderBy: { created_at: 'desc' },
  });

  if (!customer) {
    customer = await prisma.customers.create({
      data: {
        customer_number: await nextCustomerNumber(prisma),
        name: `UK Mehr-Packstücke Demo (${stamp})`,
        name2: CUSTOMER_NAME2,
        payment_term_days: 30,
        default_incoterm: 'DAP',
        invoice_email: `uk-pkg-${stamp}@example.com`,
        notes: 'Seed: 5 Sendungen GB, je 5 Packstückzeilen, Relation England Logistics.',
        created_by: user.id,
      },
    });
  }

  const loadAddr = await prisma.addresses.create({
    data: {
      customer_id: customer.id,
      type: 'loading',
      name: 'Werk Stuttgart-Region',
      street: 'Motorstraße 7',
      zip: '70499',
      city: 'Stuttgart',
      country_code: 'DE',
      lat: 48.82497,
      lng: 9.0986075,
      contact_name: 'Versand',
      contact_phone: '+49 711 123450',
    },
  });

  const outboundGb = await prisma.routing_rules.findFirst({
    where: { country_code: 'GB', is_active: true, direction: { in: ['OUTBOUND', 'BOTH'] } },
    orderBy: { priority: 'desc' },
  });

  const loadingDate = new Date();
  loadingDate.setUTCHours(0, 0, 0, 0);
  const deliveryDate = new Date(loadingDate);
  deliveryDate.setUTCDate(deliveryDate.getUTCDate() + 4);

  const created: string[] = [];

  for (let i = 0; i < 5; i++) {
    const uk = UK_STOPS[i];
    const lines = SHIPMENT_LINES[i];
    const pkgInputs: PackageLineInput[] = lines.map((l) => ({
      quantity: l.quantity,
      length_cm: l.length_cm,
      width_cm: l.width_cm,
      height_cm: l.height_cm,
      weight_kg: l.weight_kg,
      stackable: l.stackable,
    }));
    const agg = aggregatePackageLines(pkgInputs);
    const fpg = calculateChargeableWeightFromAggregates({
      totalWeightKg: agg.totalWeightKg,
      cbm: agg.cbm,
      ldm: agg.ldm,
      totalQuantity: agg.totalQuantity,
    });
    const cw = fpg.chargeableWeight;
    const pre = legCost(cw, RATES.prePer100, RATES.preMin);
    const main = legCost(cw, RATES.mainPer100, RATES.mainMin);
    const on = legCost(cw, RATES.onPer100, RATES.onMin);
    const total = Math.round((pre + main + on) * 100) / 100;
    const freightRevenue = Math.round((total * 1.28 + 85 + i * 40) * 100) / 100;
    const margin = Math.round((freightRevenue - total) * 100) / 100;
    const cmPct = freightRevenue > 0 ? Math.round((margin / freightRevenue) * 10000) / 100 : 0;

    const delAddr = await prisma.addresses.create({
      data: {
        customer_id: customer.id,
        type: 'delivery',
        name: uk.name,
        name2: `UK Ziel ${i + 1}/5`,
        street: uk.street,
        zip: uk.zip,
        city: uk.city,
        country_code: 'GB',
        lat: uk.lat,
        lng: uk.lng,
        contact_name: `Goods In · ${uk.city}`,
        contact_phone: `+44 20 ${7100000 + i}`,
      },
    });

    const shipmentNumber = await nextShipmentNumber(prisma);
    await prisma.shipments.create({
      data: {
        shipment_number: shipmentNumber,
        customer_id: customer.id,
        customer_ref: `UK-EL-${stamp}-${i + 1}`,
        status: 'new',
        loading_address_id: loadAddr.id,
        delivery_address_id: delAddr.id,
        loading_date: loadingDate,
        loading_time_from: timeOnDate(8 + i, 0),
        loading_time_to: timeOnDate(12, 0),
        delivery_date: deliveryDate,
        delivery_time_from: timeOnDate(9, 0),
        delivery_time_to: timeOnDate(17, 0),
        package_type: lines[0].package_type,
        package_count: agg.totalQuantity,
        weight_kg: agg.totalWeightKg,
        ldm: agg.ldm,
        volume_m3: agg.cbm,
        length_cm: agg.maxLengthCm,
        width_cm: agg.maxWidthCm,
        height_cm: agg.maxHeightCm,
        incoterm: 'DAP',
        freight_payer: 'sender',
        transport_type: 'DIREKT',
        comment: `Seed England Logistics: ${agg.totalQuantity} Packstücke (${lines.length} Zeilen), FPG ${cw} kg.`,
        created_by: user.id,
        freight_revenue: freightRevenue,
        relation_id: relationId,
        outbound_routing_id: outboundGb?.id ?? null,
        outbound_delivery_type: outboundGb?.delivery_type ?? 'CHARTER',
        outbound_partner_name: outboundGb?.partner_name ?? 'England Logistics',
        inbound_delivery_type: 'OWN_NV',
        cbm: fpg.cbm,
        chargeable_weight: cw,
        volume_weight_cbm: fpg.volumeWeightCbm,
        volume_weight_ldm: fpg.volumeWeightLdm,
        fpg_method: fpg.calculationMethod,
        pre_carriage_cost: pre,
        main_carriage_cost: main,
        on_carriage_cost: on,
        total_cost: total,
        contribution_margin: margin,
        cm_percent: cmPct,
        shipment_package_items: {
          create: lines.map((l, idx) => ({
            line_index: idx,
            package_type: l.package_type,
            quantity: l.quantity,
            length_cm: l.length_cm,
            width_cm: l.width_cm,
            height_cm: l.height_cm,
            weight_kg: l.weight_kg,
            stackable: l.stackable,
          })),
        },
      },
    });
    created.push(`${shipmentNumber} → ${uk.city} (FPG ${cw} kg, DB ${margin} € / ${cmPct}%)`);
  }

  // eslint-disable-next-line no-console
  const englandLogisticsFinal = await prisma.business_partners.findUnique({
    where: { id: englandLogisticsId },
    select: { partner_number: true, name: true },
  });
  // eslint-disable-next-line no-console
  console.log(
    'England Logistics Partner:',
    englandLogisticsFinal?.partner_number ?? englandLogisticsId,
    englandLogisticsFinal?.name ?? '',
  );
  const relationFinal = await prisma.relations.findUnique({
    where: { id: relationId },
    select: { code: true, name: true },
  });
  // eslint-disable-next-line no-console
  console.log(
    'Relation:',
    relationFinal?.code ?? relationId,
    relationFinal?.name ?? '',
    '| GB-Mapping: leerer zip_prefix = ganz UK',
  );
  // eslint-disable-next-line no-console
  console.log('Kunde:', customer.customer_number, customer.name);
  for (const line of created) {
    // eslint-disable-next-line no-console
    console.log(' •', line);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
