import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'KED-TMS/1.0 carlos@ked-global-logistics.de';
const SLEEP_MS = 1100;

interface JobState {
  running: boolean;
  processed: number;
  total: number;
  errors: number;
  lastRun: string | null;
  lastError: string | null;
  byStrategy: {
    original: number;
    cleaned: number;
    umlaut: number;
    noZip: number;
    zipOnly: number;
  };
}

interface Geo {
  lat: number;
  lng: number;
}

type Strategy = 'original' | 'cleaned' | 'umlaut' | 'noZip' | 'zipOnly';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Bekannte Umlaut-/Encoding-Reparaturen aus Real-Daten. */
const UMLAUT_FIXES: Array<[RegExp, string]> = [
  [/W[šŠ]RENLOS/gi, 'WÜRENLOS'],
  [/MAZZ[šŠ]/gi, 'MAZZÈ'],
  [/D[��]CINES/gi, 'DÉCINES'],
  [/CR[��]PY/gi, 'CRÉPY'],
  [/AALBORG\s+[��]ST/gi, 'AALBORG ØST'],
];

/** Generische Umlaut-Heuristik fuer Schweizer/CH-Daten. */
function fixUmlauts(city: string): string {
  let out = city;
  for (const [re, val] of UMLAUT_FIXES) out = out.replace(re, val);
  // š/Š -> ü ist ein haeufiges Encoding-Artefakt aus CP1252→UTF8-Drift
  out = out.replace(/š/g, 'ü').replace(/Š/g, 'Ü');
  // Ersetzungs-Char isoliert -> entfernen
  out = out.replace(/[��]/g, '');
  return out.trim();
}

/** Stadt-Bereinigung: erste Teil-Komponente vor Separator/Suffix. */
function cleanCity(city: string): string {
  let s = city.trim();
  // Vor Komma/Slash: nur ersten Teil
  s = s.split(/[,/]/)[0].trim();
  // Bekannte Suffix-Tokens entfernen (am Ende des Stringfragments)
  const SUFFIX_TOKENS = [
    'INTERPORTO',
    'BUSINESS PARK',
    'IND EST',
    'IND\\. EST\\.',
    'IND\\.EST\\.',
    'INDUSTRIAL ESTATE',
    'TRADING ESTATE',
    'ST\\.\\s*CROSS',
    'ST\\s*CROSS',
    'COWLEY',
    'EAST',
    'WEST',
    'NORTH',
    'SOUTH',
    'B\\.',
    'BEI',
  ];
  for (const tok of SUFFIX_TOKENS) {
    s = s.replace(new RegExp(`\\s+${tok}\\b.*$`, 'i'), '');
  }
  return s.trim();
}

@Injectable()
export class BackfillCoordinatesService {
  private readonly logger = new Logger(BackfillCoordinatesService.name);
  private state: JobState = {
    running: false,
    processed: 0,
    total: 0,
    errors: 0,
    lastRun: null,
    lastError: null,
    byStrategy: { original: 0, cleaned: 0, umlaut: 0, noZip: 0, zipOnly: 0 },
  };
  private cache = new Map<string, Geo | null>();

  constructor(private readonly prisma: PrismaService) {}

  isRunning(): boolean {
    return this.state.running;
  }

  getStatus(): JobState {
    return { ...this.state };
  }

  async countPending(): Promise<number> {
    const r = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM addresses
      WHERE lat IS NULL AND city IS NOT NULL AND city <> ''
    `;
    return Number(r[0]?.count ?? 0);
  }

  async getFailedDiagnostics(): Promise<{
    count: number;
    samples: Array<{ id: string; country_code: string | null; zip: string | null; city: string | null; name: string | null }>;
    byCountry: Record<string, number>;
    edgeCases: { emptyCity: string[]; specialChars: string[]; longZip: string[] };
  }> {
    const all = await this.prisma.$queryRaw<
      Array<{ id: string; country_code: string | null; zip: string | null; city: string | null; name: string | null }>
    >`
      SELECT id::text AS id, country_code, zip, city, name
      FROM addresses
      WHERE lat IS NULL
    `;
    const byCountry: Record<string, number> = {};
    const emptyCity: string[] = [];
    const specialChars: string[] = [];
    const longZip: string[] = [];
    for (const a of all) {
      const cc = (a.country_code || '??').toUpperCase();
      byCountry[cc] = (byCountry[cc] ?? 0) + 1;
      if (!a.city || !a.city.trim()) {
        if (emptyCity.length < 10) emptyCity.push(a.id);
      } else if (/[^\p{L}\p{N}\s\-.,'/()]/u.test(a.city + ' ' + (a.zip ?? ''))) {
        if (specialChars.length < 10) specialChars.push(a.id);
      } else if ((a.zip ?? '').length > 10) {
        if (longZip.length < 10) longZip.push(a.id);
      }
    }
    return {
      count: all.length,
      samples: all.slice(0, 30),
      byCountry,
      edgeCases: { emptyCity, specialChars, longZip },
    };
  }

  /** Synchron: gibt die Zahl der zu bearbeitenden Adressen zurück. */
  async startJob(batchSize: number): Promise<{ total: number }> {
    if (this.state.running) {
      throw new Error('Backfill-Job läuft bereits.');
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; country_code: string | null; zip: string | null; city: string | null }>
    >`
      SELECT id::text AS id, country_code, zip, city
      FROM addresses
      WHERE lat IS NULL AND city IS NOT NULL AND city <> ''
      LIMIT ${batchSize}
    `;
    this.state = {
      running: true,
      processed: 0,
      total: rows.length,
      errors: 0,
      lastRun: new Date().toISOString(),
      lastError: null,
      byStrategy: { original: 0, cleaned: 0, umlaut: 0, noZip: 0, zipOnly: 0 },
    };
    // Fire-and-forget
    void this.runBackground(rows);
    return { total: rows.length };
  }

  private async nominatim(query: string): Promise<Geo | null> {
    const params = new URLSearchParams({ q: query, format: 'json', limit: '1' });
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
    } catch (e: any) {
      this.logger.warn(`Nominatim error for "${query}": ${e?.message}`);
      return null;
    }
  }

  /** Versucht der Reihe nach mehrere Query-Varianten. */
  private async geocodeWithFallback(
    country: string,
    zip: string,
    city: string,
  ): Promise<{ geo: Geo | null; strategy: Strategy | null }> {
    const variants: Array<{ strategy: Strategy; query: string; key: string }> = [];
    const push = (strategy: Strategy, query: string, keyParts: string) => {
      const k = `${strategy}|${keyParts}`.toLowerCase();
      if (variants.some((v) => v.key === k)) return;
      variants.push({ strategy, query, key: k });
    };

    push('original', [zip, city, country].filter(Boolean).join(' '), `${country}|${zip}|${city}`);

    const cleaned = cleanCity(city);
    if (cleaned && cleaned !== city) {
      push('cleaned', [zip, cleaned, country].filter(Boolean).join(' '), `${country}|${zip}|${cleaned}`);
    }

    const fixed = fixUmlauts(city);
    if (fixed && fixed !== city) {
      push('umlaut', [zip, fixed, country].filter(Boolean).join(' '), `${country}|${zip}|${fixed}`);
    }

    if (city) {
      push('noZip', [city, country].filter(Boolean).join(' '), `${country}||${city}`);
      const cleanedNoZip = cleanCity(fixUmlauts(city));
      if (cleanedNoZip && cleanedNoZip !== city) {
        push('noZip', [cleanedNoZip, country].filter(Boolean).join(' '), `${country}||${cleanedNoZip}`);
      }
    }

    if (zip) {
      push('zipOnly', [zip, country].filter(Boolean).join(' '), `${country}|${zip}|`);
    }

    for (const v of variants) {
      if (this.cache.has(v.key)) {
        const cached = this.cache.get(v.key) ?? null;
        if (cached) return { geo: cached, strategy: v.strategy };
        continue;
      }
      const geo = await this.nominatim(v.query);
      this.cache.set(v.key, geo);
      await sleep(SLEEP_MS);
      if (geo) return { geo, strategy: v.strategy };
    }
    return { geo: null, strategy: null };
  }

  private async runBackground(
    rows: Array<{ id: string; country_code: string | null; zip: string | null; city: string | null }>,
  ): Promise<void> {
    this.logger.log(`Backfill-Job startet: ${rows.length} Adressen`);
    try {
      for (const a of rows) {
        if (!a.city) {
          this.state.processed++;
          continue;
        }
        const country = (a.country_code || 'DE').toUpperCase();
        const zip = (a.zip || '').trim();
        const city = a.city.trim();

        const { geo, strategy } = await this.geocodeWithFallback(country, zip, city);

        if (geo && strategy) {
          try {
            await this.prisma.addresses.update({
              where: { id: a.id },
              data: { lat: geo.lat as any, lng: geo.lng as any },
            });
            this.state.byStrategy[strategy]++;
          } catch (e: any) {
            this.state.errors++;
            this.logger.warn(`Update-Fehler ${a.id}: ${e?.message}`);
          }
        } else {
          this.state.errors++;
        }
        this.state.processed++;
      }
      this.logger.log(
        `Backfill-Job fertig: ${this.state.processed}/${this.state.total} processed, ${this.state.errors} errors, ${this.cache.size} cache entries`,
      );
    } catch (e: any) {
      this.state.lastError = e?.message ?? 'unknown error';
      this.logger.error(`Backfill-Job abgebrochen: ${this.state.lastError}`);
    } finally {
      this.state.running = false;
    }
  }
}
