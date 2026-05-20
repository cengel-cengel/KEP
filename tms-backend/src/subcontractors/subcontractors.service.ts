import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubcontractorDto } from './dto/create-subcontractor.dto';
import { UpdateSubcontractorDto } from './dto/update-subcontractor.dto';
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
export class SubcontractorsService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateSubcontractorNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('subcontractor_number_seq')
    `;
    const value = result[0].nextval.toString().padStart(5, '0');
    return `S${value}`;
  }

  async findAll(search?: string) {
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { subcontractor_number: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.subcontractors.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const subcontractor = await this.prisma.subcontractors.findUnique({
      where: { id },
    });
    if (!subcontractor) {
      throw new NotFoundException('Subcontractor not found');
    }
    return subcontractor;
  }

  async create(dto: CreateSubcontractorDto, userId: string) {
    const number = await this.generateSubcontractorNumber();

    return this.prisma.subcontractors.create({
      data: {
        subcontractor_number: number,
        name: dto.name,
        vat_id: dto.vatId,
        street: dto.street,
        zip: dto.zip,
        city: dto.city,
        country_code: dto.countryCode ?? 'DE',
        contact_name: dto.contactName,
        contact_phone: dto.contactPhone,
        contact_email: dto.contactEmail,
        datev_account: dto.datevAccount,
        payment_term_days: dto.paymentTermDays,
        has_adr_license: dto.hasAdrLicense,
        has_temperature: dto.hasTemperature,
        max_weight_kg: dto.maxWeightKg,
        max_ldm: dto.maxLdm,
        notes: dto.notes,
        created_by: userId,
      },
    });
  }

  async update(id: string, dto: UpdateSubcontractorDto) {
    await this.ensureExists(id);

    return this.prisma.subcontractors.update({
      where: { id },
      data: {
        name: dto.name,
        vat_id: dto.vatId,
        street: dto.street,
        zip: dto.zip,
        city: dto.city,
        country_code: dto.countryCode,
        contact_name: dto.contactName,
        contact_phone: dto.contactPhone,
        contact_email: dto.contactEmail,
        datev_account: dto.datevAccount,
        payment_term_days: dto.paymentTermDays,
        has_adr_license: dto.hasAdrLicense,
        has_temperature: dto.hasTemperature,
        max_weight_kg: dto.maxWeightKg,
        max_ldm: dto.maxLdm,
        notes: dto.notes,
      },
    });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.subcontractors.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Subcontractor not found');
    }
  }

  // Sprint D: FV-Sub-Geocoding (analog NV).
  async geocodeAll(): Promise<{
    total: number;
    candidates: number;
    geocoded: number;
    failed: number;
    skipped: number;
  }> {
    const logger = new Logger('Subcontractors-Geocode');
    const subs = await this.prisma.subcontractors.findMany({
      where: { is_active: true, lat: null },
      select: {
        id: true,
        street: true,
        zip: true,
        city: true,
        country_code: true,
      },
    });
    const total = await this.prisma.subcontractors.count({
      where: { is_active: true },
    });
    let geocoded = 0;
    let failed = 0;
    let skipped = 0;
    for (const s of subs) {
      if (!s.street || !s.city) {
        skipped++;
        continue;
      }
      const query = `${s.street}, ${s.zip ?? ''} ${s.city}, ${s.country_code ?? 'DE'}`;
      try {
        const res = await nominatimGeocode(query);
        if (res && Number.isFinite(res.lat) && Number.isFinite(res.lng)) {
          await this.prisma.subcontractors.update({
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
    return { total, candidates: subs.length, geocoded, failed, skipped };
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
    const subs = await this.prisma.subcontractors.findMany({
      where: {
        is_active: true,
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
    return subs
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
  }
}
