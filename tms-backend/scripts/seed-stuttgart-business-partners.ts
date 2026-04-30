/**
 * SEED SCRIPT - BUSINESS PARTNERS aus REAL-Stuttgart-Daten
 *
 * Spiegelt die 49 REAL-Customers (aus seed-stuttgart-real.ts)
 * als business_partners mit partner_type='CUSTOMER', damit sie
 * im UI (das nur business_partners zeigt) sichtbar werden.
 *
 * Schema-konform:
 *   - partner_number = "BP-REAL-<kunde_nr>"
 *   - partner_type   = 'CUSTOMER'
 *   - name, country_code, zip, city aus seed-data.json
 *   - is_active = true
 *   - corporate_group_id = NULL
 *
 * IDEMPOTENT via uuid v5 (Namespace identisch zu seed-stuttgart-real).
 * shipments.business_partner_id wird hier NICHT gesetzt — bleibt NULL.
 *
 * Ausfuehrung:
 *   ts-node --transpile-only scripts/seed-stuttgart-business-partners.ts
 */

import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { v5 as uuidv5 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

let prisma: PrismaClient;
let pool: Pool;

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
  meta: { source: string; total_customers: number };
}

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

async function loadSeedData(): Promise<SeedData> {
  const dataPath = path.join(__dirname, 'seed-data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`seed-data.json nicht gefunden: ${dataPath}`);
  }
  return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
}

async function seedBusinessPartners(data: SeedData) {
  console.log(`\nBusiness Partners (${data.customers.length})...`);
  let ok = 0;
  let err = 0;

  for (const c of data.customers) {
    const id = generateId('bp', c.kunde_nr);
    const partner_number = `BP-REAL-${c.kunde_nr}`;
    const country = (c.land || 'DE').slice(0, 2).toUpperCase();
    const zip = (c.plz || '').slice(0, 10);
    const city = (c.ort || '').slice(0, 100);

    try {
      await prisma.business_partners.upsert({
        where: { partner_number },
        create: {
          id,
          partner_number,
          partner_type: 'CUSTOMER',
          name: c.name.slice(0, 200),
          country_code: country,
          zip,
          city,
          is_active: true,
          corporate_group_id: null,
        },
        update: {
          name: c.name.slice(0, 200),
          country_code: country,
          zip,
          city,
          is_active: true,
          partner_type: 'CUSTOMER',
        },
      });
      ok++;
    } catch (e: any) {
      err++;
      if (err <= 3) {
        console.error(`  Fehler bei BP ${c.kunde_nr}: ${e.message}`);
      }
    }
  }
  console.log(`  -> ${ok} angelegt/aktualisiert, ${err} Fehler`);
}

async function summary() {
  const total = await prisma.business_partners.count({
    where: { partner_number: { startsWith: 'BP-REAL-' } },
  });
  console.log(`\nBusiness Partners (BP-REAL-*): ${total}`);
}

async function main() {
  console.log('===========================================');
  console.log('SEED: BUSINESS PARTNERS aus REAL-DATEN');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL fehlt.');
  }
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  const data = await loadSeedData();
  console.log(`\nQuelle: ${data.meta.source}`);
  console.log(`${data.meta.total_customers} Customers werden als BP gespiegelt`);

  await seedBusinessPartners(data);
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
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
  });
