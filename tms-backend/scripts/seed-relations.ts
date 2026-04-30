/**
 * SEED: relations aus Depots.xlsx
 *
 * Erzeugt 1037 Eintraege in der relations-Tabelle. Verlinkt
 * jede relation mit dem zuvor angelegten business_partner
 * (partner_number=DEPOT-<code>) ueber network_partner_id.
 *
 * IDEMPOTENT via upsert by code.
 *
 * Voraussetzung: seed-network-partners.ts wurde vorher gelaufen.
 *
 * Ausfuehrung:
 *   ts-node --transpile-only scripts/seed-relations.ts
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

interface DepotRow {
  code: string;
  rawName: string;
  countryCode: string;
}

function parseDepotName(raw: string): { countryCode: string } {
  const m = raw.match(/^(.+?),\s*([A-Z]{2})-(.+)$/);
  return { countryCode: m ? m[2].toUpperCase() : '' };
}

function loadDepots(): DepotRow[] {
  const filePath = path.join(__dirname, 'Depots.xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  const out: DepotRow[] = [];
  for (const r of rows) {
    const code = String(r['Depots'] ?? '').trim();
    const rawName = String(r['Name'] ?? '').trim();
    if (!code || !rawName) continue;
    out.push({ code, rawName, ...parseDepotName(rawName) });
  }
  return out;
}

async function main() {
  console.log('===========================================');
  console.log('SEED: relations aus Depots.xlsx');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  const depots = loadDepots();
  console.log(`\nEingelesen: ${depots.length} Depots`);

  // Lookup-Map fuer network_partner_id
  const partners = await prisma.business_partners.findMany({
    where: { partner_number: { startsWith: 'DEPOT-' } },
    select: { id: true, partner_number: true },
  });
  const bpByNumber = new Map(partners.map((p) => [p.partner_number, p.id]));
  console.log(`Network-Partner-Lookup: ${bpByNumber.size} Eintraege`);

  let ok = 0;
  let err = 0;
  for (const d of depots) {
    const code = d.code.slice(0, 20);
    const id = generateId('relation:depot', d.code);
    const networkPartnerId = bpByNumber.get(`DEPOT-${d.code}`) ?? null;
    try {
      await prisma.relations.upsert({
        where: { code },
        create: {
          id,
          code,
          name: d.rawName.slice(0, 100),
          direction: 'BOTH',
          country_to: (d.countryCode || 'DE').slice(0, 2).toUpperCase(),
          network_partner_id: networkPartnerId,
          is_active: true,
        },
        update: {
          name: d.rawName.slice(0, 100),
          direction: 'BOTH',
          country_to: (d.countryCode || 'DE').slice(0, 2).toUpperCase(),
          network_partner_id: networkPartnerId,
          is_active: true,
        },
      });
      ok++;
    } catch (e: any) {
      err++;
      if (err <= 3) console.error(`  Fehler bei relation ${code}: ${e.message}`);
    }
  }

  const total = await prisma.relations.count();
  console.log(`\n-> ${ok} angelegt/aktualisiert, ${err} Fehler`);
  console.log(`relations gesamt: ${total}`);

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
