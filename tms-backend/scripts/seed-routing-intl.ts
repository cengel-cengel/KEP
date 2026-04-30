/**
 * SEED: routing_rules aus "Routing international.xlsx"
 *
 * Liest 531 Routing-Regeln aus Tab "Tabelle1" und legt fuer
 * jede einen routing_rules-Eintrag an. Verlinkt partner_id
 * mit business_partner DEPOT-<code>.
 *
 * Spalten:
 *   Relation | Name | Strasse | Land | PLZ-Bereich von-bis |
 *   fuer Eingangs-Relation (Belog) | Prio Eingang |
 *   fuer Ausgangs-Relation         | Prio Ausgang |
 *   Bedingungen
 *
 * direction:
 *   - Eingang Ja + Ausgang Ja  -> BOTH
 *   - nur Eingang Ja           -> INBOUND
 *   - nur Ausgang Ja           -> OUTBOUND
 *   - keine Ja                 -> SKIP (kein Routing)
 *
 * IDEMPOTENT via uuid v5 by (code, country, zip_from, zip_to,
 * direction). Die Bedingungen-Spalte wird in dieser Phase A
 * NICHT persistiert (kein Engine-Auswertung yet).
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

/** "0001..9999" / "3200...3399" / "0001-9999" -> {from, to} */
function parsePlzRange(s: string): { from: string; to: string } | null {
  const t = (s ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d+)\s*(?:\.{2,}|\s*-\s*)\s*(\d+)$/);
  if (m) return { from: m[1], to: m[2] };
  // einzelner PLZ-Wert
  const single = t.match(/^(\d+)$/);
  if (single) return { from: single[1], to: single[1] };
  return null;
}

function isYes(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'ja' || s === 'yes' || s === 'true' || s === '1' || s === 'y' || s === 'j';
}

interface Row {
  code: string;
  name: string;
  country: string;
  plzRange: string;
  inFlag: boolean;
  inPrio: number;
  outFlag: boolean;
  outPrio: number;
}

function loadRules(): Row[] {
  const filePath = path.join(__dirname, 'Routing international.xlsx');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Routing international.xlsx nicht gefunden: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  const out: Row[] = [];
  for (const r of rows) {
    const code = String(r['Relation'] ?? '').trim();
    const name = String(r['Name'] ?? '').trim();
    const country = String(r['Land'] ?? '').trim().toUpperCase();
    const plzRange = String(r['PLZ-Bereich von - bis'] ?? '').trim();
    if (!code || !country || !plzRange) continue;
    out.push({
      code,
      name,
      country,
      plzRange,
      inFlag: isYes(r['für Eingangs-Relation (Belog)']),
      inPrio: Number(r['Priorität Eingangs-Relation (Belog)'] ?? 0) || 0,
      outFlag: isYes(r['für Ausgangs-Relation']),
      outPrio: Number(r['Priorität Ausgangs-Relation'] ?? 0) || 0,
    });
  }
  return out;
}

async function main() {
  console.log('===========================================');
  console.log('SEED: routing_rules International');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  const rules = loadRules();
  console.log(`\nEingelesen: ${rules.length} Zeilen`);

  // Partner-Lookup
  const partners = await prisma.business_partners.findMany({
    where: { partner_number: { startsWith: 'DEPOT-' } },
    select: { id: true, partner_number: true },
  });
  const bpByNumber = new Map(partners.map((p) => [p.partner_number, p.id]));

  let ok = 0;
  let err = 0;
  let skipped = 0;
  for (const r of rules) {
    const range = parsePlzRange(r.plzRange);
    if (!range) {
      skipped++;
      continue;
    }
    let direction: 'INBOUND' | 'OUTBOUND' | 'BOTH' | null = null;
    if (r.inFlag && r.outFlag) direction = 'BOTH';
    else if (r.inFlag) direction = 'INBOUND';
    else if (r.outFlag) direction = 'OUTBOUND';
    if (!direction) {
      skipped++;
      continue;
    }
    const priority = Math.max(r.inPrio, r.outPrio) || 0;
    const partnerId = bpByNumber.get(`DEPOT-${r.code}`) ?? null;
    const key = `${r.code}|${r.country}|${range.from}|${range.to}|${direction}`;
    const id = generateId('routing-intl', key);
    try {
      await prisma.routing_rules.upsert({
        where: { id },
        create: {
          id,
          rule_name: `${r.code} – ${r.name}`.slice(0, 100),
          direction,
          country_code: r.country.slice(0, 2),
          zip_from: range.from.slice(0, 10),
          zip_to: range.to.slice(0, 10),
          delivery_type: 'NETWORK_PARTNER',
          partner_id: partnerId,
          partner_name: r.name.slice(0, 200),
          priority,
          is_active: true,
        },
        update: {
          rule_name: `${r.code} – ${r.name}`.slice(0, 100),
          direction,
          country_code: r.country.slice(0, 2),
          zip_from: range.from.slice(0, 10),
          zip_to: range.to.slice(0, 10),
          delivery_type: 'NETWORK_PARTNER',
          partner_id: partnerId,
          partner_name: r.name.slice(0, 200),
          priority,
          is_active: true,
        },
      });
      ok++;
    } catch (e: any) {
      err++;
      if (err <= 3) console.error(`  Fehler bei ${r.code}/${r.country}: ${e.message}`);
    }
  }
  console.log(`\n-> ${ok} angelegt/aktualisiert, ${skipped} skipped, ${err} Fehler`);

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
