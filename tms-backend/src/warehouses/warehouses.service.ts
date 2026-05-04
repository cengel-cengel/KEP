import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { buildAddressQuery, nominatimGeocode } from '../lib/nominatim.lib';

@Injectable()
export class WarehousesService {
  private readonly logger = new Logger(WarehousesService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Geocoding nur sinnvoll wenn (lat ODER lng leer)
   * UND Adresse minimal komplett: city + (street ODER zip).
   */
  private shouldAttemptGeocode(input: {
    street?: string | null;
    zip?: string | null;
    city?: string | null;
    lat: number | null;
    lng: number | null;
  }): boolean {
    const coordsMissing = input.lat == null || input.lng == null;
    const cityOk = !!input.city && input.city.trim().length > 0;
    const streetOrZipOk =
      (!!input.street && input.street.trim().length > 0) ||
      (!!input.zip && input.zip.trim().length > 0);
    return coordsMissing && cityOk && streetOrZipOk;
  }

  async list() {
    return this.prisma.warehouses.findMany({
      orderBy: [{ is_default: 'desc' }, { name: 'asc' }],
    });
  }

  async getDefault() {
    return this.prisma.warehouses.findFirst({
      where: { is_default: true, active: true },
    });
  }

  async getOne(id: string) {
    const w = await this.prisma.warehouses.findUnique({ where: { id } });
    if (!w) throw new NotFoundException('Lager nicht gefunden');
    return w;
  }

  private async ensureSingleDefault(targetId?: string) {
    await this.prisma.warehouses.updateMany({
      where: { id: { not: targetId ?? '' }, is_default: true },
      data: { is_default: false },
    });
  }

  private async maybeGeocode(input: {
    street?: string | null;
    zip?: string | null;
    city?: string | null;
    country?: string | null;
    lat?: number | null;
    lng?: number | null;
  }): Promise<{ lat: number | null; lng: number | null } | null> {
    if (input.lat != null && input.lng != null) return null;
    const q = buildAddressQuery({
      street: input.street,
      zip: input.zip,
      city: input.city,
      country: input.country ?? 'DE',
    });
    if (!q) return null;
    const geo = await nominatimGeocode(q);
    if (!geo) return null;
    return { lat: geo.lat, lng: geo.lng };
  }

  async create(dto: CreateWarehouseDto) {
    const willGeocode = this.shouldAttemptGeocode({
      street: dto.street,
      zip: dto.zip,
      city: dto.city,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
    });
    let geocoded: { lat: number | null; lng: number | null } | null = null;
    if (willGeocode) {
      this.logger.log(
        `create: geocoding "${buildAddressQuery({
          street: dto.street,
          zip: dto.zip,
          city: dto.city,
          country: dto.country ?? 'DE',
        })}"`,
      );
      geocoded = await this.maybeGeocode(dto);
      this.logger.log(
        `create: geocode result: ${
          geocoded ? `${geocoded.lat},${geocoded.lng}` : 'null'
        }`,
      );
    } else {
      this.logger.log(
        `create: skip geocode (lat=${dto.lat ?? 'null'}, lng=${dto.lng ?? 'null'}, city="${dto.city ?? ''}")`,
      );
    }
    if (dto.is_default) await this.ensureSingleDefault();
    return this.prisma.warehouses.create({
      data: {
        name: dto.name,
        street: dto.street ?? undefined,
        zip: dto.zip ?? undefined,
        city: dto.city ?? undefined,
        country: dto.country ?? 'DE',
        lat: dto.lat ?? geocoded?.lat ?? undefined,
        lng: dto.lng ?? geocoded?.lng ?? undefined,
        is_default: dto.is_default ?? false,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const existing = await this.prisma.warehouses.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lager nicht gefunden');

    const merged = {
      street: dto.street === undefined ? existing.street : dto.street,
      zip: dto.zip === undefined ? existing.zip : dto.zip,
      city: dto.city === undefined ? existing.city : dto.city,
      country: dto.country ?? existing.country,
      lat:
        dto.lat === undefined
          ? existing.lat != null
            ? Number(existing.lat)
            : null
          : dto.lat,
      lng:
        dto.lng === undefined
          ? existing.lng != null
            ? Number(existing.lng)
            : null
          : dto.lng,
    };
    let lat: number | null | undefined =
      dto.lat === undefined ? undefined : dto.lat;
    let lng: number | null | undefined =
      dto.lng === undefined ? undefined : dto.lng;
    // Robuste Logic: Geocoden wann immer Coords fehlen UND Adresse ausreicht.
    // Vorher war's an addressChanged gebunden -> existing Lager mit
    // lat/lng=null bekam keine 2. Chance.
    const willGeocode = this.shouldAttemptGeocode(merged);
    if (willGeocode) {
      this.logger.log(
        `update(${id}): geocoding "${buildAddressQuery({
          street: merged.street,
          zip: merged.zip,
          city: merged.city,
          country: merged.country,
        })}" (mergedLat=${merged.lat ?? 'null'}, mergedLng=${merged.lng ?? 'null'})`,
      );
      const geo = await this.maybeGeocode({
        street: merged.street,
        zip: merged.zip,
        city: merged.city,
        country: merged.country,
        lat: null,
        lng: null,
      });
      this.logger.log(
        `update(${id}): geocode result: ${geo ? `${geo.lat},${geo.lng}` : 'null'}`,
      );
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    } else {
      this.logger.log(
        `update(${id}): skip geocode (mergedLat=${merged.lat ?? 'null'}, mergedLng=${merged.lng ?? 'null'}, city="${merged.city ?? ''}")`,
      );
    }
    if (dto.is_default === true) await this.ensureSingleDefault(id);

    return this.prisma.warehouses.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        street: dto.street === undefined ? undefined : dto.street,
        zip: dto.zip === undefined ? undefined : dto.zip,
        city: dto.city === undefined ? undefined : dto.city,
        country: dto.country ?? undefined,
        lat: lat === undefined ? undefined : lat,
        lng: lng === undefined ? undefined : lng,
        is_default: dto.is_default ?? undefined,
        active: dto.active ?? undefined,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.warehouses.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lager nicht gefunden');
    await this.prisma.warehouses.delete({ where: { id } });
    return { ok: true };
  }
}
