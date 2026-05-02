/**
 * SEED: NV-Gebiete (Stuttgart-NV) + Tour-Gebiete
 *
 * Quelle: existierende relations mit code LIKE 'ERKA_NV_%'
 *         + routing_rules (delivery_type='OWN_NV') fuer plz_pattern.
 *
 * Idempotent via uuid v5 + ON CONFLICT (code).
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

const FARB_PALETTE = [
  '#1e40af', '#dc2626', '#16a34a', '#ca8a04', '#7c3aed',
  '#0891b2', '#ea580c', '#be185d', '#0d9488', '#4338ca',
  '#65a30d', '#b91c1c', '#0369a1', '#a21caf', '#15803d',
];

async function main() {
  console.log('===========================================');
  console.log('SEED: NV-Gebiete (Stuttgart-NV + Tour-Gebiete)');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  // ---- Schritt 1: Master-NV-Gebiet Stuttgart ----
  const stuttgartId = generateId('nv-gebiet', 'STUTTGART_NV');
  const stuttgart = await prisma.nv_gebiete.upsert({
    where: { code: 'STUTTGART_NV' },
    create: {
      id: stuttgartId,
      code: 'STUTTGART_NV',
      name: 'Nahverkehr Stuttgart',
      gebiet_typ: 'BALLUNGSRAUM',
      aktiv: true,
    },
    update: {
      name: 'Nahverkehr Stuttgart',
      gebiet_typ: 'BALLUNGSRAUM',
      aktiv: true,
    },
  });
  console.log(`Schritt 1: NV-Gebiet ${stuttgart.code} (${stuttgart.id})`);

  // ---- Schritt 2: Tour-Gebiete aus existing ERKA_NV_* relations ----
  const erkaRelations = await prisma.relations.findMany({
    where: { code: { startsWith: 'ERKA_NV_' } },
    orderBy: { code: 'asc' },
  });
  console.log(`\nGefundene ERKA-NV-Relations: ${erkaRelations.length}`);

  // PLZ-Pattern aus routing_rules sammeln (delivery_type='OWN_NV', partner via relation_id leider nicht
  // gesetzt -> Match ueber rule_name "NV <Tour> ...")
  const allOwnNv = await prisma.routing_rules.findMany({
    where: { delivery_type: 'OWN_NV', is_active: true },
    select: { rule_name: true, zip_from: true, country_code: true },
  });

  let tourOk = 0;
  let i = 0;
  for (const rel of erkaRelations) {
    // Tour-Suffix extrahieren: ERKA_NV_<TOUR>
    const tourCode = rel.code.replace(/^ERKA_NV_/, '');
    const plz = allOwnNv
      .filter((r) => r.rule_name?.startsWith(`NV ${tourCode} `))
      .map((r) => r.zip_from)
      .filter((p): p is string => !!p);
    const plzUnique = [...new Set(plz)].sort();

    const id = generateId('nv-tour-gebiet', rel.code);
    const farbe = FARB_PALETTE[i % FARB_PALETTE.length];
    try {
      await prisma.nv_tour_gebiete.upsert({
        where: { code: rel.code },
        create: {
          id,
          nv_gebiet_id: stuttgart.id,
          code: rel.code,
          name: rel.name,
          plz_pattern: plzUnique.length > 0 ? plzUnique : undefined,
          relation_id: rel.id,
          farbe,
          aktiv: true,
        },
        update: {
          nv_gebiet_id: stuttgart.id,
          name: rel.name,
          plz_pattern: plzUnique.length > 0 ? plzUnique : undefined,
          relation_id: rel.id,
          aktiv: true,
        },
      });
      tourOk++;
      i++;
    } catch (e: any) {
      console.error(`  Tour-Gebiet-Fehler ${rel.code}: ${e.message}`);
    }
  }
  console.log(`Schritt 2: ${tourOk}/${erkaRelations.length} Tour-Gebiete angelegt/aktualisiert`);

  // plz_ranges am Master aus Aggregat aller Tour-Gebiet-PLZ pflegen
  const allTourGebiete = await prisma.nv_tour_gebiete.findMany({
    where: { nv_gebiet_id: stuttgart.id },
    select: { plz_pattern: true },
  });
  const plzAggregat = new Set<string>();
  for (const t of allTourGebiete) {
    if (Array.isArray(t.plz_pattern)) {
      for (const p of t.plz_pattern) {
        if (typeof p === 'string') plzAggregat.add(p);
      }
    }
  }
  await prisma.nv_gebiete.update({
    where: { id: stuttgart.id },
    data: { plz_ranges: [...plzAggregat].sort() },
  });
  console.log(`Schritt 3: ${plzAggregat.size} PLZ in Master-Gebiet aggregiert`);

  console.log('\n===========================================');
  console.log('FERTIG');
  console.log('===========================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
