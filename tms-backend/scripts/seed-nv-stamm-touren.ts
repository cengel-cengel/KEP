/**
 * SEED: NV-Stamm-Touren
 *
 * Pro nv_tour_gebiete eine Default-Stamm-Tour:
 *   code        = '<TG-CODE>_MO_FR'  (slice(0, 40))
 *   name        = '<TG-CODE> Mo-Fr Tour'
 *   wochentage  = ['MO','DI','MI','DO','FR']
 *   start_zeit  = 07:00
 *   default_subunternehmer = erster Sub des Gebiets (falls vorhanden)
 *
 * Idempotent via uuid v5 + upsert on code.
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
  console.log('SEED: NV-Stamm-Touren (Default Mo-Fr je Tour-Gebiet)');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  const tourGebiete = await prisma.nv_tour_gebiete.findMany({
    orderBy: { code: 'asc' },
    include: {
      subunternehmer: {
        where: { aktiv: true },
        orderBy: { name: 'asc' },
        take: 1,
      },
    },
  });
  console.log(`\nTour-Gebiete: ${tourGebiete.length}`);

  const startZeit = new Date('1970-01-01T07:00:00.000Z');

  let ok = 0;
  for (const tg of tourGebiete) {
    const code = `${tg.code}_MO_FR`.slice(0, 40);
    const id = generateId('nv-stamm-tour', code);
    const subId = tg.subunternehmer[0]?.id ?? null;
    try {
      await prisma.nv_stamm_touren.upsert({
        where: { code },
        create: {
          id,
          code,
          name: `${tg.code} Mo-Fr Tour`.slice(0, 120),
          nv_tour_gebiet_id: tg.id,
          default_subunternehmer_id: subId,
          wochentage: ['MO', 'DI', 'MI', 'DO', 'FR'],
          start_zeit: startZeit,
          fahrzeug_typ: '7_5T',
          aktiv: true,
        },
        update: {
          name: `${tg.code} Mo-Fr Tour`.slice(0, 120),
          nv_tour_gebiet_id: tg.id,
          default_subunternehmer_id: subId,
          wochentage: ['MO', 'DI', 'MI', 'DO', 'FR'],
          start_zeit: startZeit,
          aktiv: true,
        },
      });
      ok++;
    } catch (e: any) {
      console.error(`  Stamm-Tour-Fehler ${code}: ${e.message}`);
    }
  }
  console.log(`Schritt 1: ${ok}/${tourGebiete.length} Stamm-Touren angelegt/aktualisiert`);

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
