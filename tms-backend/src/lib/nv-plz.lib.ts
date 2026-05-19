/**
 * NV-Gebiet PLZ-Set Helper.
 *
 * Aggregiert das PLZ-Set ALLER aktiven nv_tour_gebiete und
 * stellt einen Application-Side Match-Helper bereit.
 *
 * Cache: 60s TTL — bei Pattern-Updates greift die neue
 * Definition mit max. 1 Minute Verzögerung.
 *
 * Patterns:
 *   "70499"   → exact match
 *   "70%"     → prefix match (alle PLZ beginnend mit "70")
 * plz_pattern-Json: Array<string> oder String "p1,p2,..."
 */
import { Logger } from '@nestjs/common';

export interface NvPlzSet {
  exact: Set<string>;
  prefixes: string[];
}

interface PrismaLike {
  nv_tour_gebiete: {
    findMany(args: {
      where: { aktiv: true };
      select: { plz_pattern: true };
    }): Promise<Array<{ plz_pattern: unknown }>>;
  };
}

const logger = new Logger('NvPlzLib');

let cache: { set: NvPlzSet; ts: number } | null = null;
const TTL_MS = 60_000;

function collect(raw: string, exact: Set<string>, prefixSet: Set<string>) {
  const p = raw.trim();
  if (!p) return;
  if (p.endsWith('%')) prefixSet.add(p.slice(0, -1));
  else exact.add(p);
}

/** Aggregiert PLZ-Patterns über alle aktiven nv_tour_gebiete. */
export async function getNvPlzSet(prisma: PrismaLike): Promise<NvPlzSet> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) return cache.set;

  const tourGebiete = await prisma.nv_tour_gebiete.findMany({
    where: { aktiv: true },
    select: { plz_pattern: true },
  });

  const exact = new Set<string>();
  const prefixSet = new Set<string>();
  for (const g of tourGebiete) {
    const pp = g.plz_pattern;
    if (Array.isArray(pp)) {
      for (const x of pp) if (typeof x === 'string') collect(x, exact, prefixSet);
    } else if (typeof pp === 'string') {
      for (const part of pp.split(',')) collect(part, exact, prefixSet);
    }
  }
  const set: NvPlzSet = { exact, prefixes: Array.from(prefixSet) };
  cache = { set, ts: now };
  logger.log(
    `aggregated: ${set.exact.size} exact + ${set.prefixes.length} prefixes`,
  );
  return set;
}

/** Exact + Prefix-Wildcard Match. */
export function plzMatchesNv(zip: string, set: NvPlzSet): boolean {
  if (!zip) return false;
  if (set.exact.has(zip)) return true;
  for (const pre of set.prefixes) if (zip.startsWith(pre)) return true;
  return false;
}

/** Cache invalidieren (für Tests / Pattern-Update-Hooks). */
export function _clearNvPlzCache() {
  cache = null;
}
