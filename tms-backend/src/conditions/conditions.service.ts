// ============================================================
// TMS – Conditions Service (Frachtpreisberechnung)
// src/conditions/conditions.service.ts
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface FindConditionParams {
  customerId?: string;
  loadingCountry: string;
  deliveryCountry: string;
  date: Date;
}

interface CalculateFreightParams {
  weightKg: number;
  ldm?: number;
  packageCount?: number;
}

@Injectable()
export class ConditionsService {
  constructor(private prisma: PrismaService) {}

  async findBestCondition(params: FindConditionParams) {
    if (!params.customerId) {
      return null;
    }
    const candidates = await this.prisma.conditions.findMany({
      where: {
        customer_id: params.customerId,
        is_active: true,
        valid_from: { lte: params.date },
        OR: [{ valid_to: null }, { valid_to: { gte: params.date } }],
      },
      include: { condition_rates: { orderBy: { from_value: 'asc' } } },
      orderBy: { valid_from: 'desc' },
    });

    const scored = candidates.map((c) => ({
      condition: c,
      score:
        (c.country_from === params.loadingCountry
          ? 2
          : c.country_from === null
            ? 0
            : -99) +
        (c.country_to === params.deliveryCountry
          ? 2
          : c.country_to === null
            ? 0
            : -99),
    }));

    const valid = scored.filter((s) => s.score >= 0);
    if (!valid.length) return null;

    valid.sort((a, b) => b.score - a.score);
    return valid[0].condition;
  }

  async calculateFreight(
    conditionId: string,
    params: CalculateFreightParams,
  ): Promise<number> {
    const condition = await this.prisma.conditions.findUnique({
      where: { id: conditionId },
      include: { condition_rates: { orderBy: { from_value: 'asc' } } },
    });

    if (!condition || !condition.condition_rates.length) return 0;

    let basisValue: number;
    switch (condition.basis) {
      case 'weight':
        basisValue = params.weightKg;
        break;
      case 'ldm':
        basisValue = params.ldm ?? 0;
        break;
      case 'flat':
        basisValue = 1;
        break;
      default:
        basisValue = params.ldm ?? params.weightKg;
    }

    const rate = condition.condition_rates.find(
      (r) =>
        basisValue >= Number(r.from_value) && basisValue <= Number(r.to_value),
    );

    if (!rate) {
      const maxRate =
        condition.condition_rates[condition.condition_rates.length - 1];
      if (basisValue > Number(maxRate.to_value)) {
        const basePrice = basisValue * Number(maxRate.rate);
        return this.applyMinChargeAndSurcharge(basePrice, condition);
      }
      return 0;
    }

    const basePrice =
      condition.basis === 'flat'
        ? Number(rate.rate)
        : basisValue * Number(rate.rate);

    return this.applyMinChargeAndSurcharge(basePrice, condition);
  }

  private applyMinChargeAndSurcharge(
    basePrice: number,
    condition: any,
  ): number {
    const afterMinCharge = Math.max(
      basePrice,
      Number(condition.min_charge ?? 0),
    );
    const fuelSurchargePct = Number(condition.fuel_surcharge_pct ?? 0);
    const total = afterMinCharge * (1 + fuelSurchargePct / 100);
    return Math.round(total * 100) / 100;
  }

  async findByCustomer(customerId: string) {
    return this.prisma.conditions.findMany({
      where: { customer_id: customerId, is_active: true },
      include: { condition_rates: { orderBy: { from_value: 'asc' } } },
      orderBy: { valid_from: 'desc' },
    });
  }

  async create(data: any, userId: string) {
    const { rates, ...conditionData } = data;

    return this.prisma.conditions.create({
      data: {
        ...conditionData,
        created_by: userId,
        condition_rates: { create: rates },
      },
      include: { condition_rates: true },
    });
  }

  async findOne(id: string) {
    const condition = await this.prisma.conditions.findUnique({
      where: { id },
      include: { condition_rates: { orderBy: { from_value: 'asc' } } },
    });

    if (!condition) {
      throw new NotFoundException(`Kondition ${id} nicht gefunden`);
    }

    return condition;
  }

  async previewPrice(params: {
    customerId?: string;
    loadingCountry: string;
    deliveryCountry: string;
    date: Date;
    weightKg: number;
    ldm?: number;
    packageCount?: number;
  }) {
    if (!params.customerId) {
      return {
        conditionFound: false,
        freightRevenue: 0,
        message: 'Preisvorschau nur mit klassischem Kundenkonto (Tarife).',
      };
    }

    const condition = await this.findBestCondition({
      customerId: params.customerId,
      loadingCountry: params.loadingCountry,
      deliveryCountry: params.deliveryCountry,
      date: params.date,
    });

    if (!condition) {
      return {
        conditionFound: false,
        freightRevenue: 0,
        message: 'Keine Kondition gefunden – bitte manuell eintragen',
      };
    }

    const freightRevenue = await this.calculateFreight(condition.id, {
      weightKg: params.weightKg,
      ldm: params.ldm,
      packageCount: params.packageCount,
    });

    return {
      conditionFound: true,
      conditionId: condition.id,
      conditionName: condition.name,
      basis: condition.basis,
      fuelSurchargePct: condition.fuel_surcharge_pct,
      freightRevenue,
    };
  }
}
