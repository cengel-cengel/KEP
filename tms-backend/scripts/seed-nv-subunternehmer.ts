/**
 * SEED: NV-Subunternehmer
 *
 * Quelle:
 *   - existierende nv_tour_gebiete (siehe seed-nv-gebiete)
 *   - business_partners (partner_type='SUBCONTRACTOR') aus seed-erka-nv
 *
 * Strategie:
 *   1) Default-Subunternehmer "ERKA" als business_partner sicherstellen
 *      (falls nicht aus seed-erka-nv vorhanden)
 *   2) Pro Tour-Gebiet 1 Default-Subunternehmer ERKA mit
 *      tarif_typ='TAGESPAUSCHALE', tarif_tagespauschale_eur=280
 *
 * Idempotent: uuid v5 + upsert.
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

async function main() {
  console.log('===========================================');
  console.log('SEED: NV-Subunternehmer (ERKA Default je Tour-Gebiet)');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  // ---- Schritt 1: ERKA als business_partner sicherstellen ----
  const erkaPartnerNumber = 'SUB-ERKA';
  const erkaId = generateId('bp:sub', 'erka');
  const erka = await prisma.business_partners.upsert({
    where: { partner_number: erkaPartnerNumber },
    create: {
      id: erkaId,
      partner_number: erkaPartnerNumber,
      partner_type: 'SUBCONTRACTOR',
      name: 'ERKA Transport',
      country_code: 'DE',
      is_active: true,
    },
    update: {
      partner_type: 'SUBCONTRACTOR',
      is_active: true,
    },
  });
  console.log(`Schritt 1: business_partner ERKA (${erka.id})`);

  // ---- Schritt 2: Pro Tour-Gebiet 1 Default-Subunternehmer ----
  const tourGebiete = await prisma.nv_tour_gebiete.findMany({
    orderBy: { code: 'asc' },
  });
  console.log(`\nGefundene Tour-Gebiete: ${tourGebiete.length}`);

  let subOk = 0;
  for (const tg of tourGebiete) {
    const id = generateId('nv-subunternehmer:default', tg.code);
    try {
      await prisma.nv_subunternehmer.upsert({
        where: { id },
        create: {
          id,
          name: erka.name,
          nv_tour_gebiet_id: tg.id,
          business_partner_id: erka.id,
          tarif_typ: 'TAGESPAUSCHALE',
          tarif_tagespauschale_eur: 280,
          fahrzeug_typ: '7_5T',
          aktiv: true,
        },
        update: {
          name: erka.name,
          nv_tour_gebiet_id: tg.id,
          business_partner_id: erka.id,
          tarif_typ: 'TAGESPAUSCHALE',
          tarif_tagespauschale_eur: 280,
          aktiv: true,
        },
      });
      subOk++;
    } catch (e: any) {
      console.error(`  Sub-Fehler ${tg.code}: ${e.message}`);
    }
  }
  console.log(`Schritt 2: ${subOk}/${tourGebiete.length} Subunternehmer angelegt/aktualisiert`);

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
