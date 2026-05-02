/**
 * BACKFILL: shipments-Aggregat aus shipment_package_items neu berechnen
 *
 * Schreibt:
 *   length_cm/width_cm/height_cm = max der Items
 *   weight_kg = sum(weight x quantity)
 *   package_count = sum(quantity)
 *   volume_m3 = sum(L x W x H x qty) / 1e6
 *   ldm = sum(qty x L x W) / 24000  (240 cm Innenbreite)
 *
 * Idempotent. Sicher mehrfach ausführbar.
 *
 * Modi:
 *   DRY_RUN=1  → nur Diffs loggen, kein Update
 *   sonst      → schreibt
 *
 * Ausfuehrung:
 *   ts-node --transpile-only scripts/recalc-shipment-aggregates.ts
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

let prisma: PrismaClient;
let pool: Pool;

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

interface Aggregate {
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  weight_kg: number;
  package_count: number;
  volume_m3: number;
  ldm: number;
}

function computeAggregate(
  items: Array<{
    length_cm: number;
    width_cm: number;
    height_cm: number;
    weight_kg: number | string;
    quantity: number;
  }>,
): Aggregate | null {
  if (items.length === 0) return null;
  let maxL = 0;
  let maxW = 0;
  let maxH = 0;
  let totalKg = 0;
  let totalCount = 0;
  let totalCm3 = 0;
  let totalLdm = 0;
  for (const it of items) {
    const L = Number(it.length_cm) || 0;
    const W = Number(it.width_cm) || 0;
    const H = Number(it.height_cm) || 0;
    const kg = Number(it.weight_kg) || 0;
    const qty = Math.max(1, Number(it.quantity) || 1);
    if (L > maxL) maxL = L;
    if (W > maxW) maxW = W;
    if (H > maxH) maxH = H;
    totalKg += kg * qty;
    totalCount += qty;
    totalCm3 += L * W * H * qty;
    totalLdm += (qty * L * W) / 24000;
  }
  return {
    length_cm: maxL || null,
    width_cm: maxW || null,
    height_cm: maxH || null,
    weight_kg: totalKg,
    package_count: totalCount,
    volume_m3: Math.round(totalCm3 / 1000) / 1000,
    ldm: Math.round(totalLdm * 100) / 100,
  };
}

async function main() {
  console.log('===========================================');
  console.log('BACKFILL: shipments-Aggregat aus items');
  console.log('===========================================');

  const dryRun = process.env.DRY_RUN === '1';
  console.log(dryRun ? '*** DRY-RUN — keine Updates ***' : '*** APPLY-Modus ***');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  const shipments = await prisma.shipments.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      shipment_number: true,
      length_cm: true,
      width_cm: true,
      height_cm: true,
      weight_kg: true,
      package_count: true,
      volume_m3: true,
      ldm: true,
      shipment_package_items: {
        select: {
          length_cm: true,
          width_cm: true,
          height_cm: true,
          weight_kg: true,
          quantity: true,
        },
      },
    },
  });
  console.log(`\nGesamt: ${shipments.length} Sendungen`);

  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let errors = 0;

  for (const s of shipments) {
    const agg = computeAggregate(s.shipment_package_items as any);
    if (!agg) {
      skipped++;
      continue;
    }
    const cur = {
      length_cm: s.length_cm,
      width_cm: s.width_cm,
      height_cm: s.height_cm,
      weight_kg: Number(s.weight_kg) || 0,
      package_count: s.package_count,
      volume_m3: Number(s.volume_m3) || 0,
      ldm: Number(s.ldm) || 0,
    };
    const diff =
      cur.length_cm !== agg.length_cm ||
      cur.width_cm !== agg.width_cm ||
      cur.height_cm !== agg.height_cm ||
      Math.abs(cur.weight_kg - agg.weight_kg) > 0.01 ||
      cur.package_count !== agg.package_count ||
      Math.abs(cur.volume_m3 - agg.volume_m3) > 0.001 ||
      Math.abs(cur.ldm - agg.ldm) > 0.01;
    if (!diff) {
      unchanged++;
      continue;
    }
    if (changed < 5) {
      console.log(`  ${s.shipment_number}:`);
      console.log(`    alt: L${cur.length_cm} W${cur.width_cm} H${cur.height_cm} ${cur.weight_kg}kg ${cur.package_count}x ldm=${cur.ldm}`);
      console.log(`    neu: L${agg.length_cm} W${agg.width_cm} H${agg.height_cm} ${agg.weight_kg}kg ${agg.package_count}x ldm=${agg.ldm}`);
    }
    changed++;
    if (!dryRun) {
      try {
        await prisma.shipments.update({
          where: { id: s.id },
          data: agg,
        });
      } catch (e: any) {
        errors++;
        if (errors <= 3) console.error(`  Fehler bei ${s.shipment_number}: ${e.message}`);
      }
    }
  }

  console.log('\n=== ERGEBNIS ===');
  console.log(`changed:   ${changed}`);
  console.log(`unchanged: ${unchanged}`);
  console.log(`skipped:   ${skipped}  (keine items)`);
  console.log(`errors:    ${errors}`);
  if (dryRun && changed > 0) {
    console.log('\nDRY-RUN — kein Schreiben.  Erneut ohne DRY_RUN ausfuehren um zu apply.');
  }
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
