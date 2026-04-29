import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CostsService } from '../costs/costs.service';
import type { pricing_rules } from '../../generated/prisma';
import type { PriceBasisInput, PriceResult } from './pricing-hub.types';
import { aggregatePackageLines, calculateChargeableWeightFromAggregates } from '../costs/freight-weight.calculator';
import type { PackageLineInput } from '../costs/freight-weight.calculator';
import type { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import type { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import type { ImportResult } from './dto/import-result.dto';
import * as XLSX from 'xlsx';
import type { Express } from 'express';

type FindRuleParams = {
  ruleType: string;
  customerId?: string;
  partnerId?: string;
  subcontractorId?: string;
  originCountry?: string;
  originZip?: string;
  destCountry?: string;
  destZip?: string;
};

@Injectable()
export class PricingHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostsService,
  ) {}

  async shouldUseHub(): Promise<boolean> {
    const count = await this.prisma.pricing_rules.count({
      where: { is_active: true },
    });
    return count > 0;
  }

  private todayUtcDate(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private normZip(s?: string | null): string | null {
    if (!s) return null;
    const t = String(s).trim().toUpperCase().replace(/\s/g, '');
    return t.length ? t : null;
  }

  async findRule(params: FindRuleParams): Promise<pricing_rules | null> {
    const today = this.todayUtcDate();

    if (!params.originCountry || !params.destCountry) {
      throw new BadRequestException('originCountry and destCountry are required for rule lookup');
    }

    const originZip = this.normZip(params.originZip);
    const destZip = this.normZip(params.destZip);

    const where: any = {
      rule_type: params.ruleType,
      is_active: true,
      origin_country: params.originCountry,
      dest_country: params.destCountry,
      valid_from: { lte: today },
      OR: [{ valid_to: null }, { valid_to: { gte: today } }],
    };

    // Only constrain by entity IDs when provided; otherwise keep fallback rules eligible.
    if (params.customerId) {
      where.customer_id = { in: [params.customerId, null] };
    }
    if (params.partnerId) {
      where.partner_id = { in: [params.partnerId, null] };
    }
    if (params.subcontractorId) {
      where.subcontractor_id = { in: [params.subcontractorId, null] };
    }

    const candidates = await this.prisma.pricing_rules.findMany({ where });

    const filtered = candidates.filter((r) => {
      const originOk =
        r.origin_zip_prefix == null ||
        (originZip != null && originZip.startsWith(String(r.origin_zip_prefix).trim().toUpperCase()));
      if (!originOk) return false;

      const destOk =
        r.dest_zip_prefix == null ||
        (destZip != null && destZip.startsWith(String(r.dest_zip_prefix).trim().toUpperCase()));
      if (!destOk) return false;

      return true;
    });

    if (!filtered.length) return null;

    const score = (r: pricing_rules) => {
      const originLen =
        r.origin_zip_prefix != null && originZip != null
          ? String(r.origin_zip_prefix).trim().length
          : 0;
      const destLen =
        r.dest_zip_prefix != null && destZip != null
          ? String(r.dest_zip_prefix).trim().length
          : 0;

      const customerBoost = params.customerId ? (r.customer_id ? 1 : 0) : 0;
      const partnerBoost = params.partnerId ? (r.partner_id ? 1 : 0) : 0;
      const subBoost = params.subcontractorId ? (r.subcontractor_id ? 1 : 0) : 0;

      return (
        Number(r.priority ?? 0) * 1_000_000 +
        (originLen + destLen) * 10_000 +
        customerBoost * 500 +
        partnerBoost * 200 +
        subBoost * 100
      );
    };

    filtered.sort((a, b) => score(b) - score(a));
    return filtered[0] ?? null;
  }

  async getRuleById(id: string): Promise<pricing_rules | null> {
    return this.prisma.pricing_rules.findUnique({ where: { id } });
  }

  private clamp(n: number, min: number, max: number | null | undefined): number {
    if (n < min) return min;
    if (max != null && n > max) return max;
    return n;
  }

  async calculatePrice(
    ruleId: string,
    input: PriceBasisInput,
  ): Promise<PriceResult> {
    const rule = await this.prisma.pricing_rules.findUnique({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('Pricing rule not found');

    const totalQuantity = Math.max(1, input.packageCount ?? 1);

    const fpg = calculateChargeableWeightFromAggregates({
      totalWeightKg: input.weightKg,
      cbm: input.cbm,
      ldm: input.ldm,
      totalQuantity,
    });

    const chargeableWeight = fpg.chargeableWeight;
    const ldm = input.ldm;

    let baseRaw = 0;
    let minApplied = Number(rule.min_charge ?? 0);
    let maxApplied: number | null = rule.max_charge != null ? Number(rule.max_charge) : null;

    if (rule.rate_basis === 'PER_100KG') {
      baseRaw = (chargeableWeight / 100) * Number(rule.rate ?? 0);
    } else if (rule.rate_basis === 'PER_LDM') {
      baseRaw = ldm * Number(rule.rate ?? 0);
    } else if (rule.rate_basis === 'PER_SHIPMENT' || rule.rate_basis === 'FLAT') {
      baseRaw = Number(rule.rate ?? 0);
    } else if (rule.rate_basis === 'PER_STOP') {
      baseRaw = (input.stopCount ?? 0) * Number(rule.rate ?? 0);
    } else if (rule.rate_basis === 'PER_KM') {
      baseRaw = (input.distanceKm ?? 0) * Number(rule.rate ?? 0);
    } else if (rule.rate_basis === 'PER_DAY') {
      baseRaw = Number(rule.rate ?? 0);
    } else if (rule.rate_basis === 'ZONE') {
      const zones = this.safeParseZones(rule.zones_json);
      const destZip = this.normZip(input.destZip);
      const zoneMatch = destZip
        ? zones.find((z: any) => {
            const pcs: string[] = Array.isArray(z.postcodes) ? z.postcodes : [];
            return pcs.some((pc) => destZip.startsWith(String(pc).trim().toUpperCase()));
          })
        : null;
      if (!zoneMatch) {
        baseRaw = 0;
      } else {
        const min = zoneMatch.min_charge ?? zoneMatch.min ?? rule.min_charge;
        minApplied = Number(min ?? 0);
        maxApplied = zoneMatch.max_charge ?? zoneMatch.max ?? rule.max_charge ?? null;
        const rate48 = zoneMatch.rate_48h ?? zoneMatch.rate_48 ?? zoneMatch.rate;
        const rate24 = zoneMatch.rate_24h ?? zoneMatch.rate_24 ?? zoneMatch.rate;
        const chosenRate = input.isTimeslot ? Number(rate24 ?? rate48 ?? 0) : Number(rate48 ?? rate24 ?? 0);
        baseRaw = chosenRate;
      }
    } else if (rule.rate_basis === 'STAFFEL' || rule.rate_basis === 'TIER') {
      const tiers = this.safeParseTiers(rule.tiers_json);
      const tierMatch = tiers.find((t: any) => {
        const from = Number(t.from ?? 0);
        const to = Number(t.to ?? Number.POSITIVE_INFINITY);
        return chargeableWeight >= from && chargeableWeight <= to;
      });
      if (!tierMatch) {
        baseRaw = 0;
      } else {
        const unit = String(tierMatch.unit ?? 'PER_100KG');
        const rate = Number(tierMatch.rate ?? rule.rate ?? 0);
        const tierMin = tierMatch.min != null ? Number(tierMatch.min) : minApplied;
        minApplied = tierMin;
        maxApplied = tierMatch.max != null ? Number(tierMatch.max) : maxApplied;
        baseRaw = this.applyUnit(unit, {
          chargeableWeight,
          ldm,
          input,
          rate,
        });
      }
    } else {
      // fallback
      baseRaw = (chargeableWeight / 100) * Number(rule.rate ?? 0);
    }

    const baseClamped = this.clamp(baseRaw, minApplied, maxApplied);

    const fuelExtra = baseClamped * Number(rule.fuel_surcharge_pct ?? 0) / 100;
    const adrExtra = input.isAdr ? Number(rule.adr_surcharge ?? 0) : 0;
    const timeExtra = input.isTimeslot ? Number(rule.timeslot_surcharge ?? 0) : 0;
    const b2cExtra = input.isB2c ? Number(rule.b2c_surcharge ?? 0) : 0;

    const total = Math.round((baseClamped + fuelExtra + adrExtra + timeExtra + b2cExtra) * 100) / 100;

    return {
      ruleId: rule.id,
      ruleName: rule.rule_name,
      ruleType: rule.rule_type,
      chargeableWeight,
      fpgMethod: fpg.calculationMethod,
      baseAmount: baseClamped,
      surcharges: { fuel: fuelExtra, adr: adrExtra, timeslot: timeExtra, b2c: b2cExtra },
      totalAmount: total,
      breakdown: {
        baseAmount: baseClamped,
        fuelExtra,
        adrExtra,
        timeExtra,
        b2cExtra,
        minApplied,
        maxApplied,
        ruleAmountRaw: baseRaw,
      },
    };
  }

  private applyUnit(
    unit: string,
    args: {
      chargeableWeight: number;
      ldm: number;
      input: PriceBasisInput;
      rate: number;
    },
  ): number {
    switch (unit) {
      case 'PER_SHIPMENT':
        return args.rate;
      case 'PER_100KG':
        return (args.chargeableWeight / 100) * args.rate;
      case 'PER_LDM':
        return args.ldm * args.rate;
      case 'PER_STOP':
        return (args.input.stopCount ?? 0) * args.rate;
      case 'PER_KM':
        return (args.input.distanceKm ?? 0) * args.rate;
      case 'PER_DAY':
        return args.rate;
      default:
        return (args.chargeableWeight / 100) * args.rate;
    }
  }

  private safeParseZones(zonesJson: any): any[] {
    if (!zonesJson) return [];
    if (typeof zonesJson !== 'string') return zonesJson;
    try {
      const parsed = JSON.parse(zonesJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private safeParseTiers(tiersJson: any): any[] {
    if (!tiersJson) return [];
    if (typeof tiersJson !== 'string') return tiersJson;
    try {
      const parsed = JSON.parse(tiersJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async calculateShipmentPricing(shipmentId: string) {
    const shipment = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: {
        id: true,
        customer_id: true,
        business_partner_id: true,
        relation_id: true,
        tour_id: true,
        is_hazmat: true,
        delivery_time_from: true,
        delivery_time_to: true,
        addresses_shipments_loading_address_idToaddresses: {
          select: { zip: true, country_code: true },
        },
        addresses_shipments_delivery_address_idToaddresses: {
          select: { zip: true, country_code: true },
        },
      },
    });
    if (!shipment) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const tour = shipment.tour_id
      ? await this.prisma.tours.findUnique({
          where: { id: shipment.tour_id },
          select: { subcontractor_id: true },
        })
      : null;

    const loading = (shipment.addresses_shipments_loading_address_idToaddresses as any) ?? {};
    const delivery = (shipment.addresses_shipments_delivery_address_idToaddresses as any) ?? {};
    const originZip = Array.isArray(loading) ? loading[0]?.zip : loading.zip;
    const originCountry = Array.isArray(loading) ? loading[0]?.country_code : loading.country_code;
    const destZip = Array.isArray(delivery) ? delivery[0]?.zip : delivery.zip;
    const destCountry = Array.isArray(delivery) ? delivery[0]?.country_code : delivery.country_code;

    const packageItems = await this.prisma.shipment_package_items.findMany({
      where: { shipment_id: shipmentId },
      orderBy: { line_index: 'asc' },
    });
    const lines: PackageLineInput[] = packageItems.map((l) => ({
      quantity: Number(l.quantity ?? 1),
      length_cm: Number(l.length_cm),
      width_cm: Number(l.width_cm),
      height_cm: Number(l.height_cm),
      weight_kg: Number(l.weight_kg),
      stackable: Boolean(l.stackable),
    }));

    const agg = aggregatePackageLines(lines);

    // Ensure shipment has chargeable weight fields populated (used by other parts).
    await this.costs.calculateShipmentFPG(shipmentId);

    const isTimeslot = !!shipment.delivery_time_from && !!shipment.delivery_time_to;
    const isAdr = !!shipment.is_hazmat;

    const customerRule = await this.findRule({
      ruleType: 'CUSTOMER_TARIFF',
      customerId: shipment.customer_id ?? undefined,
      partnerId: shipment.business_partner_id ?? undefined,
      subcontractorId: undefined,
      originCountry: originCountry ?? 'DE',
      originZip,
      destCountry: destCountry ?? 'DE',
      destZip,
    });

    const preRule = await this.findRule({
      ruleType: 'SUB_VORLAUF',
      subcontractorId: tour?.subcontractor_id ?? undefined,
      originCountry: originCountry ?? 'DE',
      originZip,
      destCountry: destCountry ?? 'DE',
      destZip,
    });

    const mainRule = await this.findRule({
      ruleType: 'SUB_HAUPTLAUF',
      subcontractorId: tour?.subcontractor_id ?? undefined,
      originCountry: originCountry ?? 'DE',
      originZip,
      destCountry: destCountry ?? 'DE',
      destZip,
    } as any);

    const onRule = await this.findRule({
      ruleType: 'PARTNER_NACHLAUF',
      partnerId: shipment.business_partner_id ?? undefined,
      originCountry: originCountry ?? 'DE',
      originZip,
      destCountry: destCountry ?? 'DE',
      destZip,
    });

    if (!customerRule || !preRule || !mainRule || !onRule) {
      const missing = [
        customerRule ? null : 'CUSTOMER_TARIFF',
        preRule ? null : 'SUB_VORLAUF',
        mainRule ? null : 'SUB_HAUPTLAUF',
        onRule ? null : 'PARTNER_NACHLAUF',
      ].filter(Boolean);
      throw new NotFoundException(
        `Fehlende Pricing-Hub Regeln für Sendung ${shipmentId}: ${missing.join(', ')}`,
      );
    }

    const baseInput: PriceBasisInput = {
      weightKg: agg.totalWeightKg,
      cbm: agg.cbm,
      ldm: agg.ldm,
      packageCount: agg.totalQuantity,
      stopCount: 0,
      distanceKm: undefined,
      isAdr,
      isTimeslot,
      isB2c: false,
      originZip: originZip ?? undefined,
      destZip: destZip ?? undefined,
    };

    const [customerRevenue, preCarriageCost, mainCarriageCost, onCarriageCost] = await Promise.all([
      this.calculatePrice(customerRule.id, baseInput),
      this.calculatePrice(preRule.id, baseInput),
      this.calculatePrice(mainRule.id, baseInput),
      this.calculatePrice(onRule.id, baseInput),
    ]);

    const totalCost = Math.round((preCarriageCost.totalAmount + mainCarriageCost.totalAmount + onCarriageCost.totalAmount) * 100) / 100;
    const freightRevenue = customerRevenue.totalAmount;
    const contributionMargin = Math.round((freightRevenue - totalCost) * 100) / 100;
    const cmPercent = freightRevenue > 0 ? Math.round((contributionMargin / freightRevenue) * 10000) / 100 : 0;

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        freight_revenue: freightRevenue,
        pre_carriage_cost: preCarriageCost.totalAmount,
        main_carriage_cost: mainCarriageCost.totalAmount,
        on_carriage_cost: onCarriageCost.totalAmount,
        total_cost: totalCost,
        contribution_margin: contributionMargin,
        cm_percent: cmPercent,
      },
    });

    return {
      customerRevenue,
      preCarriageCost,
      mainCarriageCost,
      onCarriageCost,
      totalCost,
      contributionMargin,
      cmPercent,
    };
  }

  async calculateShipmentPricingPreview(input: {
    customerId?: string | null;
    businessPartnerId?: string | null;
    subcontractorId?: string | null;
    originZip: string;
    originCountry: string;
    destZip: string;
    destCountry: string;
    weightKg: number;
    ldm: number;
    cbm: number;
    packageCount: number;
    isHazmat?: boolean;
    isTimeslot?: boolean;
  }) {
    const baseInput: PriceBasisInput = {
      weightKg: input.weightKg,
      cbm: input.cbm,
      ldm: input.ldm,
      packageCount: Math.max(1, input.packageCount),
      stopCount: 0,
      distanceKm: undefined,
      isAdr: !!input.isHazmat,
      isTimeslot: !!input.isTimeslot,
      isB2c: false,
      originZip: input.originZip,
      destZip: input.destZip,
    };

    try {
      const [customerRule, preRule, mainRule, onRule] = await Promise.all([
        this.findRule({
          ruleType: 'CUSTOMER_TARIFF',
          customerId: input.customerId ?? undefined,
          partnerId: input.businessPartnerId ?? undefined,
          originCountry: input.originCountry,
          originZip: input.originZip,
          destCountry: input.destCountry,
          destZip: input.destZip,
        }),
        this.findRule({
          ruleType: 'SUB_VORLAUF',
          subcontractorId: input.subcontractorId ?? undefined,
          originCountry: input.originCountry,
          originZip: input.originZip,
          destCountry: input.destCountry,
          destZip: input.destZip,
        }),
        this.findRule({
          ruleType: 'SUB_HAUPTLAUF',
          subcontractorId: input.subcontractorId ?? undefined,
          originCountry: input.originCountry,
          originZip: input.originZip,
          destCountry: input.destCountry,
          destZip: input.destZip,
        }),
        this.findRule({
          ruleType: 'PARTNER_NACHLAUF',
          partnerId: input.businessPartnerId ?? undefined,
          originCountry: input.originCountry,
          originZip: input.originZip,
          destCountry: input.destCountry,
          destZip: input.destZip,
        }),
      ]);

      if (!customerRule || !preRule || !mainRule || !onRule) {
        const missing = [
          customerRule ? null : 'CUSTOMER_TARIFF',
          preRule ? null : 'SUB_VORLAUF',
          mainRule ? null : 'SUB_HAUPTLAUF',
          onRule ? null : 'PARTNER_NACHLAUF',
        ].filter(Boolean);
        return { ok: false as const, message: `Fehlende Pricing-Hub Regeln: ${missing.join(', ')}` };
      }

      const [customerRevenue, preCarriageCost, mainCarriageCost, onCarriageCost] = await Promise.all([
        this.calculatePrice(customerRule.id, baseInput),
        this.calculatePrice(preRule.id, baseInput),
        this.calculatePrice(mainRule.id, baseInput),
        this.calculatePrice(onRule.id, baseInput),
      ]);

      const totalCost =
        Math.round(
          (preCarriageCost.totalAmount + mainCarriageCost.totalAmount + onCarriageCost.totalAmount) * 100,
        ) / 100;

      const freightRevenue = customerRevenue.totalAmount;
      const contributionMargin = Math.round((freightRevenue - totalCost) * 100) / 100;
      const cmPercent = freightRevenue > 0 ? Math.round((contributionMargin / freightRevenue) * 10000) / 100 : 0;

      const dbAmpel = cmPercent >= 15 ? 'green' : cmPercent >= 5 ? 'yellow' : 'red';

      return {
        ok: true as const,
        customerRevenue,
        preCarriageCost,
        mainCarriageCost,
        onCarriageCost,
        totalCost,
        contributionMargin,
        cmPercent,
        dbAmpel,
      };
    } catch (e: any) {
      return { ok: false as const, message: e?.message ?? 'Pricing-Hub Berechnung fehlgeschlagen' };
    }
  }

  async getAllRules(filters: {
    ruleType?: string;
    customerId?: string;
    partnerId?: string;
    isActive?: boolean;
    search?: string;
  }): Promise<pricing_rules[]> {
    return this.prisma.pricing_rules.findMany({
      where: {
        rule_type: filters.ruleType ?? undefined,
        customer_id: filters.customerId ?? undefined,
        partner_id: filters.partnerId ?? undefined,
        is_active: filters.isActive ?? undefined,
        ...(filters.search
          ? {
              OR: [
                { rule_name: { contains: filters.search, mode: 'insensitive' as any } },
                { description: { contains: filters.search, mode: 'insensitive' as any } },
              ],
            }
          : {}),
      } as any,
      orderBy: [{ priority: 'desc' }, { valid_from: 'desc' }],
    });
  }

  private computeAutoPriority(input: { customerId?: string; destZipPrefix?: string | null }): number {
    const destPrefix = input.destZipPrefix ? String(input.destZipPrefix).trim() : null;
    const len = destPrefix ? destPrefix.length : 0;
    const hasCustomer = !!input.customerId;
    if (hasCustomer) {
      if (!destPrefix) return 50;
      if (len === 3) return 110;
      if (len === 2) return 100;
      return 50;
    }
    // fallback
    if (!destPrefix) return 1;
    if (len === 3) return 20;
    if (len === 2) return 10;
    return 1;
  }

  async createRule(dto: CreatePricingRuleDto, userId: string) {
    const autoPriority =
      dto.priority == null ? this.computeAutoPriority({ customerId: dto.customerId ?? undefined, destZipPrefix: dto.destZipPrefix ?? null }) : dto.priority;

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : this.todayUtcDate();

    return this.prisma.pricing_rules.create({
      data: {
        rule_type: dto.ruleType,
        rule_name: dto.ruleName,
        description: dto.description ?? null,
        customer_id: dto.customerId ?? null,
        partner_id: dto.partnerId ?? null,
        subcontractor_id: dto.subcontractorId ?? null,
        relation_id: dto.relationId ?? null,
        origin_country: dto.originCountry,
        origin_zip_prefix: dto.originZipPrefix ?? null,
        dest_country: dto.destCountry,
        dest_zip_prefix: dto.destZipPrefix ?? null,
        priority: autoPriority,
        rate_basis: dto.rateBasis ?? 'PER_100KG',
        rate: Number(dto.rate),
        min_charge: dto.minCharge != null ? Number(dto.minCharge) : 0,
        max_charge: Number(dto.maxCharge),
        zones_json: dto.zonesJson ?? null,
        tiers_json: dto.tiersJson ?? null,
        fuel_surcharge_pct: dto.fuelSurchargePct != null ? Number(dto.fuelSurchargePct) : 0,
        adr_surcharge: dto.adrSurcharge != null ? Number(dto.adrSurcharge) : 0,
        timeslot_surcharge: dto.timeslotSurcharge != null ? Number(dto.timeslotSurcharge) : 0,
        b2c_surcharge: dto.b2cSurcharge != null ? Number(dto.b2cSurcharge) : 0,
        valid_from: validFrom,
        valid_to: dto.validTo ? new Date(dto.validTo) : null,
        is_active: dto.isActive ?? true,
        source: 'MANUAL',
        created_by: userId,
      },
    });
  }

  async updateRule(id: string, dto: UpdatePricingRuleDto, userId: string) {
    const existing = await this.prisma.pricing_rules.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rule not found');

    return this.prisma.pricing_rules.update({
      where: { id },
      data: {
        ...(dto.ruleType != null ? { rule_type: dto.ruleType } : {}),
        ...(dto.ruleName != null ? { rule_name: dto.ruleName } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.customerId !== undefined ? { customer_id: dto.customerId ?? null } : {}),
        ...(dto.partnerId !== undefined ? { partner_id: dto.partnerId ?? null } : {}),
        ...(dto.subcontractorId !== undefined ? { subcontractor_id: dto.subcontractorId ?? null } : {}),
        ...(dto.relationId !== undefined ? { relation_id: dto.relationId ?? null } : {}),
        ...(dto.originCountry != null ? { origin_country: dto.originCountry } : {}),
        ...(dto.originZipPrefix !== undefined ? { origin_zip_prefix: dto.originZipPrefix ?? null } : {}),
        ...(dto.destCountry != null ? { dest_country: dto.destCountry } : {}),
        ...(dto.destZipPrefix !== undefined ? { dest_zip_prefix: dto.destZipPrefix ?? null } : {}),
        ...(dto.priority != null ? { priority: dto.priority } : {}),
        ...(dto.rateBasis != null ? { rate_basis: dto.rateBasis } : {}),
        ...(dto.rate != null ? { rate: dto.rate } : {}),
        ...(dto.minCharge != null ? { min_charge: dto.minCharge } : {}),
        ...(dto.maxCharge != null ? { max_charge: dto.maxCharge } : {}),
        ...(dto.zonesJson !== undefined ? { zones_json: dto.zonesJson ?? null } : {}),
        ...(dto.tiersJson !== undefined ? { tiers_json: dto.tiersJson ?? null } : {}),
        ...(dto.fuelSurchargePct != null ? { fuel_surcharge_pct: dto.fuelSurchargePct } : {}),
        ...(dto.adrSurcharge != null ? { adr_surcharge: dto.adrSurcharge } : {}),
        ...(dto.timeslotSurcharge != null ? { timeslot_surcharge: dto.timeslotSurcharge } : {}),
        ...(dto.b2cSurcharge != null ? { b2c_surcharge: dto.b2cSurcharge } : {}),
        ...(dto.validFrom !== undefined
          ? { valid_from: dto.validFrom ? new Date(dto.validFrom) : this.todayUtcDate() }
          : {}),
        ...(dto.validTo !== undefined ? { valid_to: dto.validTo ? new Date(dto.validTo) : null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        updated_by: userId,
      },
    });
  }

  async deleteRule(id: string, userId: string) {
    const existing = await this.prisma.pricing_rules.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rule not found');
    await this.prisma.pricing_rules.update({
      where: { id },
      data: { is_active: false, updated_by: userId },
    });
    return { ok: true };
  }

  async importFromFile(file: Express.Multer.File, ruleType: string, userId: string): Promise<ImportResult> {
    if (!file?.buffer) throw new BadRequestException('No file buffer');

    const batch = await this.prisma.pricing_import_batches.create({
      data: {
        rule_type: ruleType,
        filename: file.originalname ?? '',
        created_by: userId,
        status: 'completed',
      },
    });

    const buf = file.buffer;

    // CSV vs XLSX
    const isXlsx = (file.originalname ?? '').toLowerCase().endsWith('.xlsx');
    const rows: Record<string, string>[] = isXlsx
      ? this.readXlsxFirstSheet(buf)
      : this.readCsv(buf);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const rule_name = r.rule_name || r.ruleName || r.name;
        if (!rule_name) throw new Error('Missing rule_name');

        const origin_country = r.origin_country || r.originCountry;
        const dest_country = r.dest_country || r.destCountry;
        if (!origin_country || !dest_country) throw new Error('Missing origin_country/dest_country');

        const data: any = {
          rule_type: ruleType,
          rule_name,
          description: r.description ?? null,
          customer_id: r.customer_id ?? null,
          partner_id: r.partner_id ?? null,
          subcontractor_id: r.subcontractor_id ?? null,
          relation_id: r.relation_id ?? null,
          origin_country,
          origin_zip_prefix: r.origin_zip_prefix ?? null,
          dest_country,
          dest_zip_prefix: r.dest_zip_prefix ?? null,
          priority: r.priority != null && r.priority !== '' ? Number(r.priority) : undefined,
          rate_basis: r.rate_basis ?? r.rateBasis ?? 'PER_100KG',
          rate: Number(r.rate ?? 0),
          min_charge: r.min_charge != null && r.min_charge !== '' ? Number(r.min_charge) : 0,
          max_charge: Number(r.max_charge ?? 0),
          zones_json: r.zones_json ?? r.zonesJson ?? null,
          tiers_json: r.tiers_json ?? r.tiersJson ?? null,
          fuel_surcharge_pct: r.fuel_surcharge_pct != null ? Number(r.fuel_surcharge_pct) : 0,
          adr_surcharge: r.adr_surcharge != null ? Number(r.adr_surcharge) : 0,
          timeslot_surcharge: r.timeslot_surcharge != null ? Number(r.timeslot_surcharge) : 0,
          b2c_surcharge: r.b2c_surcharge != null ? Number(r.b2c_surcharge) : 0,
          valid_from: r.valid_from ? new Date(r.valid_from) : this.todayUtcDate(),
          valid_to: r.valid_to ? new Date(r.valid_to) : null,
          is_active: r.is_active != null ? String(r.is_active) !== '0' : true,
          source: 'CSV_IMPORT',
          import_batch_id: batch.id,
          created_by: userId,
          updated_by: userId,
        };

        await this.prisma.pricing_rules.create({ data });
        imported++;
      } catch (e: any) {
        skipped++;
        errors.push(`Zeile ${i + 2}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await this.prisma.pricing_import_batches.update({
      where: { id: batch.id },
      data: {
        imported_count: imported,
        skipped_count: skipped,
        error_count: errors.length,
        errors_json: errors.length ? JSON.stringify(errors) : null,
        status: errors.length ? 'partial' : 'completed',
      },
    });

    return { imported, skipped, errors, batchId: batch.id };
  }

  async rollbackImport(batchId: string, userId: string) {
    await this.prisma.pricing_rules.updateMany({
      where: { import_batch_id: batchId },
      data: { is_active: false, updated_by: userId },
    });
    return { ok: true };
  }

  async getImportHistory() {
    return this.prisma.pricing_import_batches.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  downloadTemplate(ruleType: string): Buffer {
    const wb = XLSX.utils.book_new();
    const header = [
      'rule_name',
      'origin_country',
      'origin_zip_prefix',
      'dest_country',
      'dest_zip_prefix',
      'customer_id',
      'partner_id',
      'subcontractor_id',
      'relation_id',
      'priority',
      'rate_basis',
      'rate',
      'min_charge',
      'max_charge',
      'fuel_surcharge_pct',
      'adr_surcharge',
      'timeslot_surcharge',
      'b2c_surcharge',
      'zones_json',
      'tiers_json',
      'valid_from',
      'valid_to',
      'is_active',
    ];

    const sheet = XLSX.utils.aoa_to_sheet([
      header,
      [
        'Beispiel-Rule',
        'DE',
        '',
        'GB',
        '',
        '',
        '',
        '',
        '',
        '',
        'PER_100KG',
        '9.00',
        '48.00',
        '999999.00',
        '5',
        '0',
        '0',
        '0',
        '',
        '',
        new Date().toISOString().slice(0, 10),
        '',
        '1',
      ],
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, 'template');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private readCsv(buf: Buffer): Record<string, string>[] {
    const text = buf.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cols = line.split(',');
      const row: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) row[header[i]] = cols[i] ?? '';
      return row;
    });
  }

  private readXlsxFirstSheet(buf: Buffer): Record<string, string>[] {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    return json as any[];
  }
}

