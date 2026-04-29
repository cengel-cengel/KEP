/**
 * Legt Demo-Stammdaten + eine abgeschlossene Tour mit Sendung und Vorlauf-Verknüpfung an.
 * Ausführung aus tms-backend (DATABASE_URL muss gesetzt sein, z. B. via .env):
 *   npx ts-node --transpile-only scripts/seed-demo-flow.ts
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
  const partnerNumber = `DEMO-${stamp}`.slice(0, 20);

  const bp = await prisma.business_partners.create({
    data: {
      partner_number: partnerNumber,
      partner_type: 'CUSTOMER',
      name: 'Demo-Kunde (Seed)',
      street: 'Industriestr. 1',
      zip: '20095',
      city: 'Hamburg',
      country_code: 'DE',
      stacking_factor: 1.2,
      avg_weight_per_stellplatz: 850,
    },
  });

  const loadAddr = await prisma.addresses.create({
    data: {
      type: 'loading',
      name: 'Demo-Lager Nord',
      street: 'Lagerweg 2',
      zip: '22335',
      city: 'Hamburg',
      country_code: 'DE',
    },
  });

  const delAddr = await prisma.addresses.create({
    data: {
      type: 'delivery',
      name: 'Demo-Empfänger Berlin',
      street: 'Hauptstr. 10',
      zip: '10115',
      city: 'Berlin',
      country_code: 'DE',
    },
  });

  const preTour = await prisma.pre_carriage_tours.create({
    data: {
      tour_date: new Date(),
      total_cost: 120,
      status: 'closed',
      created_by: user.id,
    },
  });

  const tourNumber = `T99-${stamp}`.slice(0, 30);
  const shipmentNumber = `S99-${stamp}`.slice(0, 30);

  const tour = await prisma.tours.create({
    data: {
      tour_number: tourNumber,
      tour_date: new Date(),
      status: 'closed',
      created_by: user.id,
      closed_at: new Date(),
      total_weight_kg: 1200,
      total_ldm: 2.4,
      total_revenue: 890,
      subcontractor_cost: 520,
      contribution_margin: 370,
      cm_percent: 41.57,
    },
  });

  const shipment = await prisma.shipments.create({
    data: {
      shipment_number: shipmentNumber,
      business_partner_id: bp.id,
      loading_address_id: loadAddr.id,
      delivery_address_id: delAddr.id,
      loading_date: new Date(),
      delivery_date: new Date(),
      weight_kg: 1200,
      ldm: 2.4,
      created_by: user.id,
      tour_id: tour.id,
      tour_position: 1,
      status: 'in_transit',
      transport_type: 'DIREKT',
      freight_revenue: 890,
      pre_carriage_cost: 45,
      main_carriage_cost: 210,
      inbound_delivery_type: 'HUB',
      outbound_delivery_type: 'DIRECT',
    },
  });

  await prisma.pre_carriage_shipments.create({
    data: {
      pre_carriage_tour_id: preTour.id,
      shipment_id: shipment.id,
      allocated_cost: 45,
    },
  });

  await prisma.$disconnect();
  await pool.end();

  // eslint-disable-next-line no-console
  console.log('Demo-Daten angelegt:', {
    businessPartner: bp.partner_number,
    tour: tourNumber,
    shipment: shipmentNumber,
    preCarriageTourId: preTour.id,
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
