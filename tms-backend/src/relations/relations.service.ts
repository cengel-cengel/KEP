import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRelationDto } from './dto/create-relation.dto';

@Injectable()
export class RelationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.relations.findMany({
      where: { is_active: true },
      include: {
        default_hall_location: { select: { id: true, code: true, type: true } },
        network_partner: {
          select: {
            id: true,
            name: true,
            partner_number: true,
            partner_type: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(dto: CreateRelationDto) {
    return this.prisma.relations.create({
      data: {
        code: dto.code,
        name: dto.name,
        direction: dto.direction,
        country_from: dto.country_from ?? undefined,
        country_to: dto.country_to ?? undefined,
        zip_prefix_from: dto.zip_prefix_from ?? undefined,
        zip_prefix_to: dto.zip_prefix_to ?? undefined,
        default_hall_location_id: dto.default_hall_location_id ?? undefined,
        network_partner_id: dto.network_partner_id ?? undefined,
        departure_days: dto.departure_days ?? undefined,
        departure_time: dto.departure_time
          ? new Date(`1970-01-01T${dto.departure_time}:00`)
          : undefined,
        transit_days: dto.transit_days ?? undefined,
        is_active: dto.is_active ?? true,
      },
    });
  }

  async update(
    id: string,
    dto: import('./dto/update-relation.dto').UpdateRelationDto,
  ) {
    // Basic existence check
    const existing = await this.prisma.relations.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return null;

    return this.prisma.relations.update({
      where: { id },
      data: {
        code: dto.code !== undefined ? dto.code : undefined,
        name: dto.name !== undefined ? dto.name : undefined,
        direction: dto.direction !== undefined ? dto.direction : undefined,
        country_from:
          dto.country_from !== undefined ? dto.country_from : undefined,
        country_to: dto.country_to !== undefined ? dto.country_to : undefined,
        zip_prefix_from:
          dto.zip_prefix_from !== undefined ? dto.zip_prefix_from : undefined,
        zip_prefix_to:
          dto.zip_prefix_to !== undefined ? dto.zip_prefix_to : undefined,
        default_hall_location_id:
          dto.default_hall_location_id !== undefined
            ? dto.default_hall_location_id
            : undefined,
        network_partner_id:
          dto.network_partner_id !== undefined
            ? dto.network_partner_id
            : undefined,
        departure_days:
          dto.departure_days !== undefined ? dto.departure_days : undefined,
        departure_time:
          dto.departure_time !== undefined && dto.departure_time
            ? new Date(`1970-01-01T${dto.departure_time}:00`)
            : dto.departure_time === null
              ? null
              : undefined,
        transit_days:
          dto.transit_days !== undefined ? dto.transit_days : undefined,
        is_active: dto.is_active !== undefined ? dto.is_active : undefined,
      },
    });
  }

  async autoAssignRelation(args: {
    zipTo?: string | null;
    countryTo?: string | null;
  }) {
    const zipTo = (args.zipTo ?? '').trim();
    const countryTo = (args.countryTo ?? '').trim();
    if (!zipTo || !countryTo) return null;

    const mappings = await this.prisma.zip_relation_mapping.findMany({
      where: { country_code: countryTo },
      include: {
        hall_location: { select: { code: true } },
        relation: {
          select: {
            id: true,
            default_hall_location_id: true,
            default_hall_location: { select: { code: true } },
          },
        },
      },
    });

    const zipNorm = zipTo.replace(/\s+/g, '').toUpperCase();
    const candidates = mappings
      .filter((m) => {
        const prefix = (m.zip_prefix ?? '').trim();
        if (!prefix) return true;
        const p = prefix.replace(/\s+/g, '').toUpperCase();
        return zipNorm.startsWith(p);
      })
      .sort((a, b) => {
        const prioDiff = (b.priority ?? 1) - (a.priority ?? 1);
        if (prioDiff !== 0) return prioDiff;
        return (b.zip_prefix?.length ?? 0) - (a.zip_prefix?.length ?? 0);
      });

    let best = candidates[0];
    if (!best) {
      const rel = await this.prisma.relations.findFirst({
        where: { is_active: true, country_to: countryTo },
        include: {
          default_hall_location: { select: { code: true } },
        },
        orderBy: { created_at: 'desc' },
      });
      if (!rel) return null;
      return {
        relationId: rel.id,
        hallLocationCode: rel.default_hall_location?.code ?? null,
      };
    }

    const hallLocationCode =
      best.hall_location?.code ??
      best.relation.default_hall_location?.code ??
      null;

    return {
      relationId: best.relation_id,
      hallLocationCode,
    };
  }
}
