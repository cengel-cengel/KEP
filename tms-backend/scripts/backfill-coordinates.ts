/**
 * BACKFILL: addresses.lat / addresses.lng via Nominatim
 *
 * - Liest alle addresses WHERE lat IS NULL AND city IS NOT NULL
 * - Per (country|zip|city)-Cache: identische Adressen nur 1x callen
 * - Nominatim Open-Street-Map Free Tier:
 *     1 req/sec hard rate limit, User-Agent zwingend
 *     https://operations.osmfoundation.org/policies/nominatim/
 * - Sleep 1100 ms zwischen API-Calls (100ms buffer)
 * - Idempotent: laeuft nur ueber lat IS NULL
 *
 * NICHT als Pre-deploy auf Railway laufen lassen — blockt
 * Container fuer Stunden. Stattdessen lokal mit Railway-DATABASE_URL:
 *
 *   DATABASE_URL=<railway-public-postgres-url> \
 *     npm run seed:backfill-coords
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

let prisma: PrismaClient;
let pool: Pool;

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'KED-TMS/1.0 carlos@ked-global-logistics.de';
const SLEEP_MS = 1100;

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

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function cacheKey(country: string, zip: string, city: string): string {
  return `${(country || '').toUpperCase()}|${(zip || '').trim()}|${(city || '').trim().toLowerCase()}`;
}

interface Geo {
  lat: number;
  lng: number;
}

async function geocode(country: string, zip: string, city: string): Promise<Geo | null> {
  const params = new URLSearchParams({
    q: [zip, city, country].filter(Boolean).join(' '),
    format: 'json',
    limit: '1',
  });
  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = arr?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

interface AddressRow {
  id: string;
  country_code: string | null;
  zip: string | null;
  city: string | null;
}

async function main() {
  console.log('===========================================');
  console.log('BACKFILL: addresses.lat / addresses.lng');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  const rows = await prisma.$queryRaw<AddressRow[]>`
    SELECT id::text AS id,
           country_code,
           zip,
           city
    FROM addresses
    WHERE lat IS NULL
      AND city IS NOT NULL
      AND city <> ''
  `;
  console.log(`\nUngegeocodet: ${rows.length} Adressen`);

  const cache = new Map<string, Geo | null>();
  const stats = { matched: 0, cached: 0, failed: 0, skipped: 0, err: 0 };

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    if (!a.city) {
      stats.skipped++;
      continue;
    }
    const country = (a.country_code || 'DE').toUpperCase();
    const zip = (a.zip || '').trim();
    const city = a.city.trim();
    const ck = cacheKey(country, zip, city);

    let geo: Geo | null;
    if (cache.has(ck)) {
      geo = cache.get(ck) ?? null;
      stats.cached++;
    } else {
      geo = await geocode(country, zip, city);
      cache.set(ck, geo);
      await sleep(SLEEP_MS);
    }

    if (!geo) {
      stats.failed++;
    } else {
      try {
        await prisma.addresses.update({
          where: { id: a.id },
          data: { lat: geo.lat as any, lng: geo.lng as any },
        });
        stats.matched++;
      } catch (e: any) {
        stats.err++;
        if (stats.err <= 3) console.error(`  Update-Fehler ${a.id}: ${e.message}`);
      }
    }

    if ((i + 1) % 50 === 0) {
      console.log(
        `  ... ${i + 1}/${rows.length} | matched=${stats.matched} cached=${stats.cached} failed=${stats.failed}`,
      );
    }
  }

  console.log('\n=== ERGEBNIS ===');
  console.log(`Total bearbeitet:  ${rows.length}`);
  console.log(`matched (DB):      ${stats.matched}`);
  console.log(`cached (cache hit):${stats.cached}`);
  console.log(`failed (no geo):   ${stats.failed}`);
  console.log(`skipped:           ${stats.skipped}`);
  console.log(`update errors:     ${stats.err}`);
  console.log(`Cache-Eintraege:   ${cache.size}`);

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
