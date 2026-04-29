import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { applyFuelSurcharge, num, roundMoney } from './pricing.utils';
import type { sub_conditions } from '../../generated/prisma';

@Injectable()
export class SubConditionService {
  constructor(private readonly prisma: PrismaService) {}

  private todayDate(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private validNow(c: Pick<sub_conditions, 'valid_from' | 'valid_to' | 'is_active'>) {
    if (!c.is_active) return false;
    const t = this.todayDate();
    if (c.valid_from && c.valid_from > t) return false;
    if (c.valid_to && c.valid_to < t) return false;
    return true;
  }

  async list(filters?: { subcontractorId?: string; conditionType?: string }) {
    const where: Record<string, unknown> = {};
    if (filters?.subcontractorId) where.subcontractor_id = filters.subcontractorId;
    if (filters?.conditionType) where.condition_type = filters.conditionType;
    return this.prisma.sub_conditions.findMany({
      where,
      orderBy: [{ created_at: 'desc' }],
      include: {
        subcontractors: { select: { id: true, name: true, subcontractor_number: true } },
        relations: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async create(data: Parameters<typeof this.prisma.sub_conditions.create>[0]['data']) {
    return this.prisma.sub_conditions.create({ data });
  }

  async update(id: string, data: Parameters<typeof this.prisma.sub_conditions.update>[0]['data']) {
    await this.ensureCondition(id);
    return this.prisma.sub_conditions.update({ where: { id }, data });
  }

  private async ensureCondition(id: string) {
    const c = await this.prisma.sub_conditions.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`SUB-Kondition ${id} nicht gefunden`);
    return c;
  }

  /** Dominante Relation der Tour (erste Sendung mit relation_id) */
  private dominantRelationId(
    shipments: { relation_id: string | null }[],
  ): string | null {
    for (const s of shipments) {
      if (s.relation_id) return s.relation_id;
    }
    return null;
  }

  private filterByRelation(
    rows: sub_conditions[],
    relationId: string | null,
  ): sub_conditions[] {
    const specific = rows.filter((r) => r.relation_id === relationId);
    if (specific.length) return specific;
    return rows.filter((r) => r.relation_id == null);
  }

  async calculatePreCarriageCost(
    tourId: string,
    options?: {
      meeting?: boolean;
      roundtrip?: boolean;
      distanceKm?: number;
    },
  ) {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        shipments: {
          where: { deleted_at: null },
          select: { relation_id: true, delivery_address_id: true },
        },
      },
    });
    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);
    if (!tour.subcontractor_id) {
      throw new BadRequestException('Tour hat keinen Subunternehmer');
    }

    const relId = this.dominantRelationId(tour.shipments);
    const all = await this.prisma.sub_conditions.findMany({
      where: {
        subcontractor_id: tour.subcontractor_id,
        is_active: true,
      },
    });
    const active = all.filter((c) => this.validNow(c));

    if (options?.meeting) {
      const m = active.find((c) => c.condition_type === 'MEETING');
      if (m?.meeting_rate != null) {
        const raw = num(m.meeting_rate) * 2;
        return {
          cost: applyFuelSurcharge(raw, m.fuel_surcharge_pct),
          mode: 'MEETING',
          breakdown: { meeting: raw },
        };
      }
    }
    if (options?.roundtrip) {
      const r = active.find((c) => c.condition_type === 'ROUNDTRIP');
      if (r?.roundtrip_rate != null) {
        const raw = num(r.roundtrip_rate);
        return {
          cost: applyFuelSurcharge(raw, r.fuel_surcharge_pct),
          mode: 'ROUNDTRIP',
          breakdown: { roundtrip: raw },
        };
      }
    }

    const pre = this.filterByRelation(
      active.filter((c) => c.condition_type === 'PRE_CARRIAGE'),
      relId,
    );
    if (!pre.length) {
      return { cost: 0, mode: 'NONE', breakdown: {} as Record<string, number> };
    }

    const stopCount = new Set(tour.shipments.map((s) => s.delivery_address_id)).size;
    const effectiveStops = Math.max(
      stopCount,
      num(pre[0].min_stops, 1),
    );
    const distanceKm =
      options?.distanceKm ?? num(tour.distance_km, 0);

    let best = Number.POSITIVE_INFINITY;
    const breakdown: Record<string, number> = {};

    for (const c of pre) {
      const candidates: number[] = [];
      if (c.rate_per_stop != null && num(c.rate_per_stop) > 0) {
        let x = effectiveStops * num(c.rate_per_stop);
        if (c.max_stops != null && effectiveStops > c.max_stops) {
          x = num(c.max_stops) * num(c.rate_per_stop);
        }
        x = Math.max(x, num(c.min_charge));
        candidates.push(applyFuelSurcharge(x, c.fuel_surcharge_pct));
        breakdown.perStop = x;
      }
      if (c.rate_per_day != null && num(c.rate_per_day) > 0) {
        const x = Math.max(num(c.rate_per_day), num(c.min_charge));
        candidates.push(applyFuelSurcharge(x, c.fuel_surcharge_pct));
        breakdown.daily = x;
      }
      if (c.rate_per_km != null && num(c.rate_per_km) > 0 && distanceKm > 0) {
        const x = Math.max(distanceKm * num(c.rate_per_km), num(c.min_charge));
        candidates.push(applyFuelSurcharge(x, c.fuel_surcharge_pct));
        breakdown.perKm = distanceKm * num(c.rate_per_km);
      }
      if (candidates.length) {
        best = Math.min(best, ...candidates);
      }
    }

    if (!Number.isFinite(best)) {
      return { cost: 0, mode: 'PRE_CARRIAGE', breakdown };
    }
    return { cost: roundMoney(best), mode: 'PRE_CARRIAGE_MIN', breakdown };
  }

  findBestMainCondition(
    rows: sub_conditions[],
    relationId: string | null,
  ): sub_conditions | null {
    const mains = rows.filter(
      (c) => c.condition_type === 'MAIN_CARRIAGE' && this.validNow(c),
    );
    if (!mains.length) return null;
    const scoped = this.filterByRelation(mains, relationId);
    const pool = scoped.length ? scoped : mains;
    return pool.sort(
      (a, b) => (b.relation_id ? 1 : 0) - (a.relation_id ? 1 : 0),
    )[0];
  }

  async calculateMainCarriageCost(tourId: string, forcedConditionId?: string) {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        shipments: {
          where: { deleted_at: null },
          select: {
            relation_id: true,
            ldm: true,
            weight_kg: true,
            chargeable_weight: true,
          },
        },
      },
    });
    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);
    if (!tour.subcontractor_id) {
      throw new BadRequestException('Tour hat keinen Subunternehmer');
    }

    const relId = this.dominantRelationId(tour.shipments);
    let cond: sub_conditions | null = null;

    if (forcedConditionId) {
      cond = await this.prisma.sub_conditions.findFirst({
        where: {
          id: forcedConditionId,
          subcontractor_id: tour.subcontractor_id,
          condition_type: 'MAIN_CARRIAGE',
        },
      });
      if (!cond) {
        throw new BadRequestException('Kondition passt nicht zur Tour / kein Hauptlauf-Typ');
      }
    } else if (tour.sub_condition_id) {
      cond = await this.prisma.sub_conditions.findUnique({
        where: { id: tour.sub_condition_id },
      });
      if (cond && cond.condition_type !== 'MAIN_CARRIAGE') cond = null;
    }

    if (!cond) {
      const all = await this.prisma.sub_conditions.findMany({
        where: { subcontractor_id: tour.subcontractor_id, is_active: true },
      });
      cond = this.findBestMainCondition(all, relId);
    }

    if (!cond) {
      return { cost: 0, breakdown: { mode: 'NONE' } };
    }

    const totalLdm = tour.shipments.reduce((s, x) => s + num(x.ldm), 0);
    const totalKg = tour.shipments.reduce(
      (s, x) => s + num(x.chargeable_weight ?? x.weight_kg),
      0,
    );
    const distanceKm = num(tour.distance_km, 0);
    const minLdm = num(cond.min_ldm, 0);
    const ldmEff = minLdm > 0 ? Math.max(totalLdm, minLdm) : totalLdm;

    let raw = 0;
    let mode = 'MIX';

    if (cond.rate_flat != null && num(cond.rate_flat) > 0) {
      raw = num(cond.rate_flat);
      mode = 'FLAT';
    } else if (cond.rate_per_ldm != null && num(cond.rate_per_ldm) > 0) {
      raw = ldmEff * num(cond.rate_per_ldm);
      mode = 'PER_LDM';
    } else if (cond.rate_per_kg != null && num(cond.rate_per_kg) > 0) {
      raw = totalKg * num(cond.rate_per_kg);
      mode = 'PER_KG';
    } else if (cond.rate_per_km != null && num(cond.rate_per_km) > 0 && distanceKm > 0) {
      raw = distanceKm * num(cond.rate_per_km);
      mode = 'PER_KM';
    }

    raw = Math.max(raw, num(cond.min_charge));
    const cost = applyFuelSurcharge(raw, cond.fuel_surcharge_pct);

    return {
      cost: roundMoney(cost),
      conditionId: cond.id,
      breakdown: { mode, raw, totalLdm, totalKg, distanceKm },
    };
  }

  async assignConditionToTour(tourId: string, conditionId: string) {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      select: { subcontractor_id: true },
    });
    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);
    const c = await this.prisma.sub_conditions.findUnique({
      where: { id: conditionId },
    });
    if (!c || c.subcontractor_id !== tour.subcontractor_id) {
      throw new BadRequestException('Kondition gehört nicht zum SUB dieser Tour');
    }
    if (c.condition_type !== 'MAIN_CARRIAGE') {
      throw new BadRequestException('Nur Hauptlauf-Konditionen (MAIN_CARRIAGE) zuweisbar');
    }

    const main = await this.calculateMainCarriageCost(tourId, conditionId);

    await this.prisma.tours.update({
      where: { id: tourId },
      data: {
        sub_condition_id: conditionId,
        sub_condition_type: c.condition_type,
        calculated_sub_cost: main.cost,
      },
    });

    return this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        subcontractors: { select: { id: true, name: true } },
        sub_condition: true,
      },
    });
  }

  async calculateTourCosts(
    tourId: string,
    options?: {
      distanceKm?: number;
      meeting?: boolean;
      roundtrip?: boolean;
    },
  ) {
    const pre = await this.calculatePreCarriageCost(tourId, options);
    const main = await this.calculateMainCarriageCost(tourId);
    const total = roundMoney(pre.cost + main.cost);

    const stopCount = await this.tourStopCount(tourId);

    await this.prisma.tours.update({
      where: { id: tourId },
      data: {
        stop_count: stopCount,
        ...(options?.distanceKm != null ? { distance_km: options.distanceKm } : {}),
        calculated_sub_cost: main.cost,
        subcontractor_cost: total,
      },
    });

    return {
      preCarriage: pre,
      mainCarriage: main,
      totalSubCost: total,
      stopCount,
    };
  }

  private async tourStopCount(tourId: string): Promise<number> {
    const rows = await this.prisma.shipments.findMany({
      where: { tour_id: tourId, deleted_at: null },
      select: { delivery_address_id: true },
    });
    return new Set(rows.map((r) => r.delivery_address_id)).size;
  }
}
