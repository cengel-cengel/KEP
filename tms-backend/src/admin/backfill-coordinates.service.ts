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
}

interface Geo {
  lat: number;
  lng: number;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function cacheKey(country: string, zip: string, city: string): string {
  return `${(country || '').toUpperCase()}|${(zip || '').trim()}|${(city || '').trim().toLowerCase()}`;
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
    };
    // Fire-and-forget
    void this.runBackground(rows);
    return { total: rows.length };
  }

  private async geocode(country: string, zip: string, city: string): Promise<Geo | null> {
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
    } catch (e: any) {
      this.logger.warn(`Nominatim error for ${country}|${zip}|${city}: ${e?.message}`);
      return null;
    }
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
        const ck = cacheKey(country, zip, city);

        let geo: Geo | null;
        if (this.cache.has(ck)) {
          geo = this.cache.get(ck) ?? null;
        } else {
          geo = await this.geocode(country, zip, city);
          this.cache.set(ck, geo);
          await sleep(SLEEP_MS);
        }

        if (geo) {
          try {
            await this.prisma.addresses.update({
              where: { id: a.id },
              data: { lat: geo.lat as any, lng: geo.lng as any },
            });
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
