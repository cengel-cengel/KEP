import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNvSubunternehmerDto } from './dto/create-nv-subunternehmer.dto';
import { UpdateNvSubunternehmerDto } from './dto/update-nv-subunternehmer.dto';
import { nominatimGeocode } from '../lib/nominatim.lib';

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aH =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng *
      sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH));
  return R * c;
}

@Injectable()
export class NvSubunternehmerService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSubcontractor(bpId: string) {
    const bp = await this.prisma.business_partners.findUnique({
      where: { id: bpId },
      select: { id: true, name: true, partner_type: true },
    });
    if (!bp) {
      throw new BadRequestException(
        `Business-Partner ${bpId} nicht gefunden`,
      );
    }
    if (bp.partner_type !== 'SUBCONTRACTOR') {
      throw new BadRequestException(
        `Business-Partner muss partner_type='SUBCONTRACTOR' haben (aktuell '${bp.partner_type}')`,
      );
    }
    return bp;
  }

  async list(tourGebietId?: string) {
    return this.prisma.nv_subunternehmer.findMany({
      where: tourGebietId ? { nv_tour_gebiet_id: tourGebietId } : undefined,
      orderBy: { name: 'asc' },
      include: {
        nv_tour_gebiet: { select: { id: true, code: true, name: true } },
        business_partner: {
          select: { id: true, partner_number: true, name: true },
        },
      },
    });
  }

  async getOne(id: string) {
    const s = await this.prisma.nv_subunternehmer.findUnique({
      where: { id },
      include: {
        nv_tour_gebiet: { select: { id: true, code: true, name: true } },
        business_partner: {
          select: { id: true, partner_number: true, name: true },
        },
      },
    });
    if (!s) throw new NotFoundException('NV-Subunternehmer nicht gefunden');
    return s;
  }

  async create(dto: CreateNvSubunternehmerDto) {
    const bp = await this.assertSubcontractor(dto.business_partner_id);
    return this.prisma.nv_subunternehmer.create({
      data: {
        name: bp.name.slice(0, 200),
        business_partner_id: bp.id,
        nv_tour_gebiet_id: dto.nv_tour_gebiet_id ?? undefined,
        tarif_typ: dto.tarif_typ ?? 'TAGESPAUSCHALE',
        tarif_pro_stop_eur: dto.tarif_pro_stop_eur ?? undefined,
        tarif_tagespauschale_eur: dto.tarif_tagespauschale_eur ?? undefined,
        tarif_pro_km_eur: dto.tarif_pro_km_eur ?? undefined,
        tarif_grundgebuehr_eur: dto.tarif_grundgebuehr_eur ?? undefined,
        tarif_pro_stunde_eur: dto.tarif_pro_stunde_eur ?? undefined,
        fahrzeug_typ: dto.fahrzeug_typ ?? undefined,
        max_paletten: dto.max_paletten ?? undefined,
        max_gewicht_kg: dto.max_gewicht_kg ?? undefined,
        max_volumen_m3: dto.max_volumen_m3 ?? undefined,
        max_ldm: dto.max_ldm ?? undefined,
        notiz: dto.notiz ?? undefined,
        aktiv: dto.aktiv ?? true,
      },
      include: {
        business_partner: {
          select: { id: true, partner_number: true, name: true },
        },
      },
    });
  }

  async update(id: string, dto: UpdateNvSubunternehmerDto) {
    const existing = await this.prisma.nv_subunternehmer.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException('NV-Subunternehmer nicht gefunden');

    let nameUpdate: string | undefined;
    let bpUpdate: string | undefined;
    if (
      dto.business_partner_id &&
      dto.business_partner_id !== existing.business_partner_id
    ) {
      const bp = await this.assertSubcontractor(dto.business_partner_id);
      bpUpdate = bp.id;
      nameUpdate = bp.name.slice(0, 200);
    }

    return this.prisma.nv_subunternehmer.update({
      where: { id },
      data: {
        business_partner_id: bpUpdate ?? undefined,
        name: nameUpdate ?? undefined,
        nv_tour_gebiet_id:
          dto.nv_tour_gebiet_id === undefined
            ? undefined
            : dto.nv_tour_gebiet_id,
        tarif_typ: dto.tarif_typ ?? undefined,
        tarif_pro_stop_eur:
          dto.tarif_pro_stop_eur === undefined
            ? undefined
            : dto.tarif_pro_stop_eur,
        tarif_tagespauschale_eur:
          dto.tarif_tagespauschale_eur === undefined
            ? undefined
            : dto.tarif_tagespauschale_eur,
        tarif_pro_km_eur:
          dto.tarif_pro_km_eur === undefined
            ? undefined
            : dto.tarif_pro_km_eur,
        tarif_grundgebuehr_eur:
          dto.tarif_grundgebuehr_eur === undefined
            ? undefined
            : dto.tarif_grundgebuehr_eur,
        tarif_pro_stunde_eur:
          dto.tarif_pro_stunde_eur === undefined
            ? undefined
            : dto.tarif_pro_stunde_eur,
        fahrzeug_typ:
          dto.fahrzeug_typ === undefined ? undefined : dto.fahrzeug_typ,
        max_paletten:
          dto.max_paletten === undefined ? undefined : dto.max_paletten,
        max_gewicht_kg:
          dto.max_gewicht_kg === undefined ? undefined : dto.max_gewicht_kg,
        max_volumen_m3:
          dto.max_volumen_m3 === undefined ? undefined : dto.max_volumen_m3,
        max_ldm: dto.max_ldm === undefined ? undefined : dto.max_ldm,
        notiz: dto.notiz === undefined ? undefined : dto.notiz,
        aktiv: dto.aktiv ?? undefined,
      },
      include: {
        business_partner: {
          select: { id: true, partner_number: true, name: true },
        },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.nv_subunternehmer.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException('NV-Subunternehmer nicht gefunden');
    await this.prisma.nv_subunternehmer.delete({ where: { id } });
    return { ok: true };
  }

  async bulkSetAktiv(ids: string[], aktiv: boolean) {
    const result = await this.prisma.nv_subunternehmer.updateMany({
      where: { id: { in: ids } },
      data: { aktiv },
    });
    return { count: result.count };
  }

  // Sprint D: Sub-Geocoding via Nominatim (Address aus business_partner).
  async geocodeAll(): Promise<{
    total: number;
    candidates: number;
    geocoded: number;
    failed: number;
    skipped: number;
  }> {
    const logger = new Logger('NvSub-Geocode');
    const subs = await this.prisma.nv_subunternehmer.findMany({
      where: { aktiv: true, lat: null },
      select: {
        id: true,
        business_partner: {
          select: {
            name: true,
            street: true,
            zip: true,
            city: true,
            country_code: true,
          },
        },
      },
    });
    const total = await this.prisma.nv_subunternehmer.count({
      where: { aktiv: true },
    });
    let geocoded = 0;
    let failed = 0;
    let skipped = 0;
    for (const s of subs) {
      const bp = s.business_partner;
      if (!bp?.street || !bp?.city) {
        skipped++;
        continue;
      }
      const query = `${bp.street}, ${bp.zip ?? ''} ${bp.city}, ${bp.country_code ?? 'DE'}`;
      try {
        const res = await nominatimGeocode(query);
        if (res && Number.isFinite(res.lat) && Number.isFinite(res.lng)) {
          await this.prisma.nv_subunternehmer.update({
            where: { id: s.id },
            data: {
              lat: res.lat,
              lng: res.lng,
              geocoded_at: new Date(),
            },
          });
          geocoded++;
        } else {
          failed++;
        }
      } catch (e: any) {
        logger.warn(`geocode failed for ${s.id}: ${e?.message ?? e}`);
        failed++;
      }
    }
    return {
      total,
      candidates: subs.length,
      geocoded,
      failed,
      skipped,
    };
  }

  // Sprint D: Haversine-Radius-Search.
  async searchByRadius(
    lat: number,
    lng: number,
    radius_km: number,
  ): Promise<
    Array<{
      id: string;
      name: string;
      distance_km: number;
      has_adr_license: boolean;
    }>
  > {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(radius_km) ||
      radius_km <= 0
    ) {
      throw new BadRequestException('lat/lng/radius_km ungültig.');
    }
    const subs = await this.prisma.nv_subunternehmer.findMany({
      where: {
        aktiv: true,
        lat: { not: null },
        lng: { not: null },
      },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        has_adr_license: true,
      },
    });
    const center = { lat, lng };
    const out = subs
      .map((s) => ({
        id: s.id,
        name: s.name,
        has_adr_license: s.has_adr_license,
        distance_km: haversineKm(center, {
          lat: Number(s.lat),
          lng: Number(s.lng),
        }),
      }))
      .filter((s) => s.distance_km <= radius_km)
      .sort((a, b) => a.distance_km - b.distance_km);
    return out;
  }
}
