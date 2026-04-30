/**
 * BACKFILL: shipment.relation_id ableiten aus routing_rules
 *
 * Pro Sendung mit relation_id IS NULL:
 *   1) delivery-Address holen (zip + country_code)
 *   2) routing_rule matchen (priority desc, OUTBOUND/BOTH)
 *      via raw SQL — VARCHAR BETWEEN (lexikografisch)
 *   3) relation aus rule ableiten:
 *      - delivery_type='NETWORK_PARTNER':
 *          relations WHERE network_partner_id = rule.partner_id
 *      - delivery_type='OWN_NV':
 *          rule_name "NV <Tour> <PLZ>" parsen
 *          relations WHERE code = 'ERKA_NV_<Tour>'
 *   4) UPDATE shipment.relation_id
 *
 * IDEMPOTENT: laeuft nur ueber relation_id IS NULL.
 *
 * Ausfuehrung:
 *   ts-node --transpile-only scripts/backfill-shipment-relations.ts
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

interface RuleMatch {
  id: string;
  delivery_type: string | null;
  partner_id: string | null;
  rule_name: string;
  priority: number | null;
}

interface ShipmentRow {
  id: string;
  zip: string | null;
  country: string | null;
}

async function main() {
  console.log('===========================================');
  console.log('BACKFILL: shipment.relation_id');
  console.log('===========================================');

  loadDotEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL fehlt.');
  pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter } as any);

  // Lookup-Caches
  const partnerToRelation = new Map<string, string | null>(); // partner_id -> relation.id
  const tourToRelation = new Map<string, string | null>();    // Tour z.B. "C_1" -> relation.id
  const matchCache = new Map<string, RuleMatch | null>();      // "country|zip" -> rule

  async function relationByPartner(partnerId: string): Promise<string | null> {
    if (partnerToRelation.has(partnerId)) return partnerToRelation.get(partnerId) ?? null;
    const r = await prisma.relations.findFirst({
      where: { network_partner_id: partnerId },
      select: { id: true },
    });
    const id = r?.id ?? null;
    partnerToRelation.set(partnerId, id);
    return id;
  }

  async function relationByTour(tour: string): Promise<string | null> {
    if (tourToRelation.has(tour)) return tourToRelation.get(tour) ?? null;
    const code = `ERKA_NV_${tour}`.slice(0, 20);
    const r = await prisma.relations.findUnique({
      where: { code },
      select: { id: true },
    });
    const id = r?.id ?? null;
    tourToRelation.set(tour, id);
    return id;
  }

  async function findRule(country: string, zip: string): Promise<RuleMatch | null> {
    const key = `${country}|${zip}`;
    if (matchCache.has(key)) return matchCache.get(key) ?? null;
    const rows = await prisma.$queryRaw<RuleMatch[]>`
      SELECT id, delivery_type, partner_id::text AS partner_id, rule_name, priority
      FROM routing_rules
      WHERE country_code = ${country}
        AND is_active = true
        AND direction IN ('OUTBOUND', 'BOTH')
        AND zip_from <= ${zip}
        AND zip_to >= ${zip}
      ORDER BY priority DESC NULLS LAST
      LIMIT 1
    `;
    const m = rows[0] ?? null;
    matchCache.set(key, m);
    return m;
  }

  // Lade alle Sendungen ohne relation_id
  const shipments = await prisma.$queryRaw<ShipmentRow[]>`
    SELECT s.id::text AS id,
           a.zip AS zip,
           a.country_code AS country
    FROM shipments s
    LEFT JOIN addresses a ON a.id = s.delivery_address_id
    WHERE s.relation_id IS NULL
      AND s.deleted_at IS NULL
  `;
  console.log(`\nUngebackfilled: ${shipments.length} Sendungen`);

  const stats = {
    matched: 0,
    skip_noaddr: 0,
    skip_norule: 0,
    skip_norelation: 0,
    err: 0,
  };
  const samples: { id: string; rel: string }[] = [];
  const unmatchedSamples: { country: string; zip: string }[] = [];

  for (const s of shipments) {
    if (!s.country || !s.zip) {
      stats.skip_noaddr++;
      continue;
    }
    const country = s.country.toUpperCase();
    const zip = s.zip.trim();
    try {
      const rule = await findRule(country, zip);
      if (!rule) {
        stats.skip_norule++;
        if (unmatchedSamples.length < 10) unmatchedSamples.push({ country, zip });
        continue;
      }
      let relationId: string | null = null;
      if (rule.delivery_type === 'NETWORK_PARTNER' && rule.partner_id) {
        relationId = await relationByPartner(rule.partner_id);
      } else if (rule.delivery_type === 'OWN_NV') {
        const m = (rule.rule_name ?? '').match(/^NV\s+(\S+)\s+/);
        if (m) relationId = await relationByTour(m[1]);
      }
      if (!relationId) {
        stats.skip_norelation++;
        continue;
      }
      await prisma.shipments.update({
        where: { id: s.id },
        data: { relation_id: relationId },
      });
      stats.matched++;
      if (samples.length < 5) samples.push({ id: s.id, rel: relationId });
      if (stats.matched % 100 === 0) {
        console.log(`  ... ${stats.matched} matched`);
      }
    } catch (e: any) {
      stats.err++;
      if (stats.err <= 3) console.error(`  Fehler ${s.id}: ${e.message}`);
    }
  }

  console.log('\n=== ERGEBNIS ===');
  console.log(`matched:           ${stats.matched}`);
  console.log(`skip (no addr):    ${stats.skip_noaddr}`);
  console.log(`skip (no rule):    ${stats.skip_norule}`);
  console.log(`skip (no relation):${stats.skip_norelation}`);
  console.log(`errors:            ${stats.err}`);

  if (unmatchedSamples.length > 0) {
    console.log('\nUnmatched Beispiele (Land/PLZ):');
    for (const u of unmatchedSamples) console.log(`  ${u.country} ${u.zip}`);
  }

  if (samples.length > 0) {
    const ids = samples.map((s) => s.id);
    const verify = await prisma.shipments.findMany({
      where: { id: { in: ids } },
      select: {
        shipment_number: true,
        relation: { select: { code: true, name: true, country_to: true } },
      },
    });
    console.log('\nSample Mappings:');
    for (const v of verify) {
      console.log(
        `  ${v.shipment_number}: ${v.relation?.code ?? '?'} – ${v.relation?.name ?? '?'} (${v.relation?.country_to ?? '?'})`,
      );
    }
  }

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
