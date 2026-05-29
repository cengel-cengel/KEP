/**
 * SEED: Depot-PLZ an hall_locations (Hof-Filter Stufe 1, E1).
 *
 * Befuellt hall_locations.zip + country_code anhand einer
 * code → {zip, country} Map. PLACEHOLDER-Werte unten — Carlos
 * traegt die echten Depot-PLZ ein.
 *
 * IDEMPOTENT: setzt zip/country_code per UPDATE WHERE code=…,
 * mehrfach ausfuehrbar.
 *
 * Voraussetzung:
 *   · Migration 50_hall_locations_zip.sql ist angewandt
 *     (zip + country_code-Spalten existieren).
 *   · hall_locations sind bereits gepflegt (Codes existieren).
 *
 * Ausfuehrung:
 *   ts-node --transpile-only scripts/seed-depot-plz.ts
 *   (oder: npm run seed:depot-plz)
 *
 * Update der Werte:
 *   DEPOT_PLZ-Map unten editieren, dann Skript erneut laufen.
 *   Nicht-gelistete Codes bleiben unveraendert (zip=NULL).
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

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

/**
 * PLACEHOLDER — Carlos traegt die echten Werte ein.
 * Key = hall_locations.code (z.B. 'STR', 'FRA', …).
 * country_code optional, default 'DE'.
 */
const DEPOT_PLZ: Record<string, { zip: string; country_code?: string }> = {
  // Beispiele (auskommentiert — keine Pruefung gegen die DB):
  // 'STR': { zip: '70435' },
  // 'FRA': { zip: '60311' },
  // 'WIE': { zip: '1100', country_code: 'AT' },
};

async function main() {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL nicht gesetzt.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const entries = Object.entries(DEPOT_PLZ);
  if (entries.length === 0) {
    console.log(
      '⚠ DEPOT_PLZ-Map ist leer. Bitte in scripts/seed-depot-plz.ts ' +
        'die Code→PLZ-Eintraege ergaenzen.',
    );
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  let updated = 0;
  let notFound = 0;
  for (const [code, { zip, country_code }] of entries) {
    const res = await prisma.hall_locations.updateMany({
      where: { code },
      data: { zip, country_code: country_code ?? 'DE' },
    });
    if (res.count === 0) {
      console.warn(`  · code='${code}' nicht in hall_locations gefunden.`);
      notFound++;
    } else {
      updated += res.count;
    }
  }

  console.log(
    `✓ ${updated} hall_locations aktualisiert (${notFound} Codes nicht gefunden).`,
  );

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
