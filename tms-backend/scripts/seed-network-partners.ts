/**
 * SEED: Network-Partner aus Depots.xlsx
 *
 * Liest 1037 Depot-Codes aus tms-backend/scripts/Depots.xlsx
 * und legt pro Eintrag einen business_partner mit
 * partner_type='NETWORK_PARTNER' an.
 *
 * Format der Quelle:
 *   Spalte "Depots":  "0004", "0007", ...
 *   Spalte "Name":    "Q Logistics, AT-Wien"  (parsed in name+land+ort)
 *
 * IDEMPOTENT via upsert by partner_number = "DEPOT-<code>"
 *
 * Ausfuehrung:
 *   ts-node --transpile-only scripts/seed-network-partners.ts
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { v5 as uuidv5 } from 'uuid';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

let prisma: PrismaClient;
let pool: Pool;

const SEED_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const generateId = (entity: string, key: string): string =>
  uuidv5(`${entity}:${key}`, SEED_NS);

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

interface Parsed {
  code: string;
  rawName: string;
  name: string;
  countryCode: string;
  city: string;
}

/** "Q Logistics, AT-Wien" → name="Q Logistics", country="AT", city="Wien" */
function parseDepotName(raw: string): { name: string; countryCode: string; city: string } {
  const m = raw.match(/^(.+?),\s*([A-Z]{2})-(.+)$/);
  if (m) {
    return {
      name: m[1].trim(),
      countryCode: m[2].toUpperCase(),
      city: m[3].trim(),
    };
  }
  return { name: raw.trim(), countryCode: '', city: '' };
}

function loadDepots(): Parsed[] {
  const filePath = path.join(__dirname, 'Depots.xlsx');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Depots.xlsx nicht gefunden: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  const out: Parsed[] = [];
  for (const r of rows) {
    const code = String(r['Depots'] ?? '').trim();
    const rawName = String(r['Name'] ?? '').trim();
    if (!code || !rawName) continue;
    const parsed = parseDepotName(rawName);
    out.push({ code, rawName, ...parsed });
  }
  return out;
}

async function main() {
  console.log('===========================================');
  console.log('SEED: NETWORK-PARTNER aus Depots.xlsx');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  const depots = loadDepots();
  console.log(`\nEingelesen: ${depots.length} Depots`);

  let ok = 0;
  let err = 0;
  for (const d of depots) {
    const partner_number = `DEPOT-${d.code}`.slice(0, 20);
    const id = generateId('bp:depot', d.code);
    try {
      await prisma.business_partners.upsert({
        where: { partner_number },
        create: {
          id,
          partner_number,
          partner_type: 'NETWORK_PARTNER',
          name: d.name.slice(0, 200),
          country_code: (d.countryCode || 'DE').slice(0, 2).toUpperCase(),
          city: d.city.slice(0, 100) || null,
          is_active: true,
        },
        update: {
          partner_type: 'NETWORK_PARTNER',
          name: d.name.slice(0, 200),
          country_code: (d.countryCode || 'DE').slice(0, 2).toUpperCase(),
          city: d.city.slice(0, 100) || null,
          is_active: true,
        },
      });
      ok++;
    } catch (e: any) {
      err++;
      if (err <= 3) console.error(`  Fehler bei DEPOT-${d.code}: ${e.message}`);
    }
  }

  const total = await prisma.business_partners.count({
    where: { partner_number: { startsWith: 'DEPOT-' } },
  });
  console.log(`\n-> ${ok} angelegt/aktualisiert, ${err} Fehler`);
  console.log(`Network-Partner (DEPOT-*) in DB: ${total}`);

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
