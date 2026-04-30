/**
 * SEED: ERKA NV (Tourgebiete + Subunternehmer + PLZ-Routing)
 *
 * Quelle: "Erka NV neu mit 400 Sendungen V4.xlsx" Tab "Detaildaten"
 *
 * 3 Schritte:
 *   1) Subunternehmer anlegen (unique Werte aus Spalte "Unternehmer"):
 *      business_partners mit partner_type='SUBCONTRACTOR'
 *      partner_number = "SUB-<slug>"
 *
 *   2) Relations anlegen (unique Werte aus Spalte "Tour"):
 *      relations mit code = "ERKA_NV_<Tour>"
 *      direction='BOTH', country_to='DE'
 *
 *   3) Routing-Rules pro (PLZ, Land)-Zeile:
 *      country_code='DE' (oder Spalte "Land"),
 *      zip_from = zip_to = PLZ,
 *      direction='BOTH', delivery_type='OWN_NV', priority=99
 *      partner_id = Subunternehmer-bp.id
 *
 * IDEMPOTENT via uuid v5 / unique business keys.
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

function slug(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 14); // "SUB-" + 14 = 18 chars, unter 20
}

interface DetailRow {
  tour: string;
  unternehmer: string;
  plz: string;
  land: string;
}

function loadDetail(): DetailRow[] {
  const filePath = path.join(__dirname, 'Erka NV neu mit 400 Sendungen V4.xlsx');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Erka NV xlsx nicht gefunden: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Detaildaten'];
  if (!ws) throw new Error('Tab "Detaildaten" nicht gefunden in xlsx');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  const out: DetailRow[] = [];
  for (const r of rows) {
    const tour = String(r['Tour'] ?? '').trim();
    const unt = String(r['Unternehmer'] ?? '').trim();
    const plz = String(r['PLZ'] ?? '').trim();
    const land = String(r['Land'] ?? 'DE').trim().toUpperCase() || 'DE';
    if (!tour || !plz) continue;
    out.push({ tour, unternehmer: unt, plz, land });
  }
  return out;
}

async function main() {
  console.log('===========================================');
  console.log('SEED: ERKA NV (Subs + Tourgebiete + PLZ-Routing)');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  const detail = loadDetail();
  console.log(`\nEingelesen: ${detail.length} Detailzeilen`);

  // ---- Schritt 1: Subunternehmer ----
  const uniqueUnt = [...new Set(detail.map((r) => r.unternehmer).filter(Boolean))];
  const bpByName = new Map<string, string>(); // unternehmer -> bp.id
  let subOk = 0;
  for (const u of uniqueUnt) {
    const partner_number = `SUB-${slug(u)}`.slice(0, 20);
    const id = generateId('bp:sub', u.toLowerCase());
    try {
      const bp = await prisma.business_partners.upsert({
        where: { partner_number },
        create: {
          id,
          partner_number,
          partner_type: 'SUBCONTRACTOR',
          name: u.slice(0, 200),
          country_code: 'DE',
          is_active: true,
        },
        update: {
          partner_type: 'SUBCONTRACTOR',
          name: u.slice(0, 200),
          is_active: true,
        },
      });
      bpByName.set(u, bp.id);
      subOk++;
    } catch (e: any) {
      console.error(`  Sub-Fehler ${u}: ${e.message}`);
    }
  }
  console.log(`Schritt 1: ${subOk}/${uniqueUnt.length} Subunternehmer angelegt/aktualisiert`);

  // ---- Schritt 2: Tourgebiete als relations ----
  const uniqueTour = [...new Set(detail.map((r) => r.tour))];
  let relOk = 0;
  for (const tour of uniqueTour) {
    const code = `ERKA_NV_${tour}`.slice(0, 20);
    const id = generateId('relation:erka', tour);
    try {
      await prisma.relations.upsert({
        where: { code },
        create: {
          id,
          code,
          name: `ERKA NV Tourgebiet ${tour}`.slice(0, 100),
          direction: 'BOTH',
          country_to: 'DE',
          is_active: true,
        },
        update: {
          name: `ERKA NV Tourgebiet ${tour}`.slice(0, 100),
          direction: 'BOTH',
          country_to: 'DE',
          is_active: true,
        },
      });
      relOk++;
    } catch (e: any) {
      console.error(`  Relation-Fehler ${code}: ${e.message}`);
    }
  }
  console.log(`Schritt 2: ${relOk}/${uniqueTour.length} Tourgebiet-Relations angelegt`);

  // ---- Schritt 3: Routing-Rules pro PLZ-Zeile ----
  let rrOk = 0;
  let rrErr = 0;
  for (const r of detail) {
    const partnerId = bpByName.get(r.unternehmer) ?? null;
    const key = `erka|${r.tour}|${r.land}|${r.plz}|${r.unternehmer}`;
    const id = generateId('routing-erka', key);
    try {
      await prisma.routing_rules.upsert({
        where: { id },
        create: {
          id,
          rule_name: `NV ${r.tour} ${r.plz}`.slice(0, 100),
          direction: 'BOTH',
          country_code: r.land.slice(0, 2),
          zip_from: r.plz.slice(0, 10),
          zip_to: r.plz.slice(0, 10),
          delivery_type: 'OWN_NV',
          partner_id: partnerId,
          partner_name: r.unternehmer.slice(0, 200) || null,
          priority: 99,
          is_active: true,
        },
        update: {
          rule_name: `NV ${r.tour} ${r.plz}`.slice(0, 100),
          direction: 'BOTH',
          country_code: r.land.slice(0, 2),
          zip_from: r.plz.slice(0, 10),
          zip_to: r.plz.slice(0, 10),
          delivery_type: 'OWN_NV',
          partner_id: partnerId,
          partner_name: r.unternehmer.slice(0, 200) || null,
          priority: 99,
          is_active: true,
        },
      });
      rrOk++;
    } catch (e: any) {
      rrErr++;
      if (rrErr <= 3) console.error(`  Routing-Fehler ${r.tour}/${r.plz}: ${e.message}`);
    }
  }
  console.log(`Schritt 3: ${rrOk}/${detail.length} Routing-Rules angelegt, ${rrErr} Fehler`);

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
