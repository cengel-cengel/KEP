import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  aggregatePackageLines,
  calculateChargeableWeight,
  calculateChargeableWeightFromAggregates,
  calculateFreightCost,
} from './freight-weight.calculator';

@Injectable()
export class CostsService {
  constructor(private readonly prisma: PrismaService) {}

  // LKM-based pricing constants
  private readonly CUSTOMER_FACTOR_BASE = 705; // fixed
  private readonly EUR_PER_LKM = 9; // 9 €/Lastenkilometer

  private toNumber(value: unknown): number {
    if (value == null) return 0;
    return Number(value);
  }

  private ensureNumber(value: unknown, label: string): number {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new BadRequestException(`${label} muss eine Zahl sein`);
    }
    return n;
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371; // earth radius km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private async fetchOsrmDistanceKm(
    lng1: number,
    lat1: number,
    lng2: number,
    lat2: number,
  ): Promise<number> {
    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false&alternatives=false&geometries=geojson`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OSRM responded with ${res.status}`);
      const json = await res.json();
      const meters = json?.routes?.[0]?.distance;
      if (typeof meters !== 'number' || !Number.isFinite(meters)) {
        throw new Error('OSRM route distance missing');
      }
      return meters / 1000;
    } catch (_e) {
      // Fallback to straight-line distance if OSRM fails (keeps UI responsive).
      return this.haversineKm(lat1, lng1, lat2, lng2);
    }
  }

  private async getCustomerFactorForShipment(shipmentId: string): Promise<number> {
    const shipment = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: { business_partner_id: true },
    });
    const bpId = shipment?.business_partner_id;
    if (!bpId) {
      throw new BadRequestException(`Sendung ${shipmentId} hat keinen BusinessPartner (business_partner_id)`);
    }

    const bp = await this.prisma.business_partners.findUnique({
      where: { id: bpId },
      select: { stacking_factor: true, avg_weight_per_stellplatz: true },
    });

    const stackingFactor = bp?.stacking_factor;
    const avgWeightPerStellplatz = bp?.avg_weight_per_stellplatz;
    if (stackingFactor == null || avgWeightPerStellplatz == null) {
      throw new BadRequestException(
        `BusinessPartner ${bpId} hat Stapelfaktor/Ø-Gewicht je Stellplatz nicht gesetzt (needed for LKM)`,
      );
    }

    const toNum = (d: any) => (d?.toNumber ? d.toNumber() : Number(d));
    const sf = toNum(stackingFactor);
    const aw = toNum(avgWeightPerStellplatz);
    if (!Number.isFinite(sf) || !Number.isFinite(aw) || aw <= 0) {
      throw new BadRequestException(`BusinessPartner ${bpId} LKM Werte ungültig`);
    }

    return (this.CUSTOMER_FACTOR_BASE * sf) / aw;
  }

  private async loadShipmentForFpg(shipmentId: string) {
    const shipment = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: {
        id: true,
        loading_address_id: true,
        delivery_address_id: true,
        weight_kg: true,
        length_cm: true,
        width_cm: true,
        height_cm: true,
        ldm: true,
        package_count: true,
        relation_id: true,
        tour_id: true,
        chargeable_weight: true,
        business_partner_id: true,
        cbm: true,
        volume_weight_cbm: true,
        volume_weight_ldm: true,
        fpg_method: true,
        freight_revenue: true,
        pre_carriage_cost: true,
        main_carriage_cost: true,
        on_carriage_cost: true,
        total_cost: true,
      },
    });

    if (!shipment) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);
    return shipment;
  }

  private async computeShipmentFpgFromDb(shipmentId: string) {
    const shipment = await this.loadShipmentForFpg(shipmentId);

    const pkgLines = await this.prisma.shipment_package_items.findMany({
      where: { shipment_id: shipmentId },
      orderBy: { line_index: 'asc' },
    });

    if (pkgLines.length > 0) {
      const agg = aggregatePackageLines(
        pkgLines.map((r) => ({
          quantity: r.quantity,
          length_cm: r.length_cm,
          width_cm: r.width_cm,
          height_cm: r.height_cm,
          weight_kg: Number(r.weight_kg),
          stackable: r.stackable,
        })),
      );
      const fpg = calculateChargeableWeightFromAggregates({
        totalWeightKg: agg.totalWeightKg,
        cbm: agg.cbm,
        ldm: agg.ldm,
        totalQuantity: agg.totalQuantity,
      });
      return { shipment, fpg };
    }

    if (shipment.length_cm == null) throw new BadRequestException('length_cm fehlt');
    if (shipment.width_cm == null) throw new BadRequestException('width_cm fehlt');
    if (shipment.height_cm == null) throw new BadRequestException('height_cm fehlt');
    if (shipment.package_count == null) throw new BadRequestException('package_count fehlt');

    const result = calculateChargeableWeight({
      weightKg: this.ensureNumber(shipment.weight_kg, 'weight_kg'),
      lengthCm: shipment.length_cm,
      widthCm: shipment.width_cm,
      heightCm: shipment.height_cm,
      ldm: shipment.ldm != null ? Number(shipment.ldm) : 0,
      packageCount: shipment.package_count,
    });

    return { shipment, fpg: result };
  }

  /** Vorlauf-, Hauptlauf-, Nachlauf-Tarife (cost_rates) anwenden und DB-Kennzahlen setzen. */
  async applyRelationTariffEconomics(shipmentId: string) {
    await this.calculateShipmentFPG(shipmentId);
    await this.calculatePreCarriageCost(shipmentId);
    await this.calculateMainCarriageCost(shipmentId);
    await this.calculateOnCarriageCost(shipmentId);
    const s = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: {
        freight_revenue: true,
        pre_carriage_cost: true,
        main_carriage_cost: true,
        on_carriage_cost: true,
      },
    });
    if (!s) return;
    const rev = this.toNumber(s.freight_revenue);
    const pre = this.toNumber(s.pre_carriage_cost);
    const main = this.toNumber(s.main_carriage_cost);
    const on = this.toNumber(s.on_carriage_cost);
    const total = Math.round((pre + main + on) * 100) / 100;
    const margin = Math.round((rev - total) * 100) / 100;
    const cmPct = rev > 0 ? Math.round((margin / rev) * 10000) / 100 : 0;
    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        total_cost: total,
        contribution_margin: margin,
        cm_percent: cmPct,
      },
    });
  }

  async calculateShipmentFPG(shipmentId: string) {
    const { shipment, fpg } = await this.computeShipmentFpgFromDb(shipmentId);

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        cbm: fpg.cbm,
        chargeable_weight: fpg.chargeableWeight,
        volume_weight_cbm: fpg.volumeWeightCbm,
        volume_weight_ldm: fpg.volumeWeightLdm,
        fpg_method: fpg.calculationMethod,
      },
    });

    return { shipmentId, ...fpg };
  }

  private async findApplicableCostRate(params: {
    rateType: string;
    relationId: string | null;
    subcontractorId?: string | null;
  }): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const baseWhere: any = {
      rate_type: params.rateType,
      is_active: true,
    };

    if (params.relationId) {
      baseWhere.valid_from = { lte: today };
    } else {
      baseWhere.valid_from = { lte: today };
    }

    // We assume valid_from is set for most rates. If not, we still allow them via null-tolerant logic.
    baseWhere.OR = [{ valid_from: { lte: today } }, { valid_from: null }];
    baseWhere.AND = [
      {
        OR: [{ valid_to: null }, { valid_to: { gte: today } }],
      },
    ];

    if (params.relationId && params.subcontractorId) {
      const specific = await this.prisma.cost_rates.findFirst({
        where: {
          ...baseWhere,
          relation_id: params.relationId,
          subcontractor_id: params.subcontractorId,
        },
      });
      if (specific) return specific;
    }

    if (params.relationId) {
      const relationSpecific = await this.prisma.cost_rates.findFirst({
        where: {
          ...baseWhere,
          relation_id: params.relationId,
          subcontractor_id: null,
        },
      });
      if (relationSpecific) return relationSpecific;
    }

    const general = await this.prisma.cost_rates.findFirst({
      where: {
        ...baseWhere,
        relation_id: null,
        subcontractor_id: null,
      },
    });

    if (!general) {
      throw new NotFoundException(`Kein Kostensatz für ${params.rateType} gefunden`);
    }

    return general;
  }

  private async findOnCarriageRate(params: { relationId: string | null }): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const baseWhere: any = {
      rate_type: 'ON_CARRIAGE',
      is_active: true,
      OR: [{ valid_from: { lte: today } }, { valid_from: null }],
      AND: [{ OR: [{ valid_to: null }, { valid_to: { gte: today } }] }],
    };

    if (params.relationId) {
      const specific = await this.prisma.cost_rates.findFirst({
        where: { ...baseWhere, relation_id: params.relationId, subcontractor_id: null },
      });
      if (specific) return specific;
    }

    const general = await this.prisma.cost_rates.findFirst({
      where: { ...baseWhere, relation_id: null, subcontractor_id: null },
    });
    if (!general) throw new NotFoundException(`Kein ON_CARRIAGE Kostensatz gefunden`);
    return general;
  }

  async calculatePreCarriageCost(shipmentId: string, rateId?: string | null) {
    const shipment = await this.loadShipmentForFpg(shipmentId);
    let chargeableWeight: number;
    if (!shipment.chargeable_weight) {
      const fpg = await this.calculateShipmentFPG(shipmentId);
      chargeableWeight = fpg.chargeableWeight;
    } else {
      chargeableWeight = this.toNumber(shipment.chargeable_weight);
    }

    let rate: any | null = null;
    if (rateId) {
      rate = await this.prisma.cost_rates.findUnique({ where: { id: rateId } });
    } else {
      const tour = shipment.tour_id
        ? await this.prisma.tours.findUnique({ where: { id: shipment.tour_id }, select: { subcontractor_id: true } })
        : null;
      rate = await this.findApplicableCostRate({
        rateType: 'PRE_CARRIAGE',
        relationId: shipment.relation_id,
        subcontractorId: tour?.subcontractor_id ?? null,
      });
    }
    if (!rate) throw new NotFoundException(`Kostensatz für PRE_CARRIAGE nicht gefunden`);

    const ratePer = this.toNumber(rate.rate_per_100kg);
    const min = this.toNumber(rate.min_charge);

    const raw = Math.round((chargeableWeight / 100) * ratePer * 100) / 100;
    const cost = Math.round(Math.max(raw, min) * 100) / 100;

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: { pre_carriage_cost: cost },
    });

    return { shipmentId, preCarriageCost: cost, rate };
  }

  async calculateMainCarriageCost(shipmentId: string, rateId?: string | null) {
    const shipment = await this.loadShipmentForFpg(shipmentId);
    if (!shipment.chargeable_weight) {
      await this.calculateShipmentFPG(shipmentId);
    }

    const shipmentAfterFpg = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: { chargeable_weight: true },
    });

    const chargeableWeight = this.toNumber(shipmentAfterFpg?.chargeable_weight);

    let rate: any | null = null;
    if (rateId) {
      rate = await this.prisma.cost_rates.findUnique({ where: { id: rateId } });
    } else {
      const tour = shipment.tour_id
        ? await this.prisma.tours.findUnique({ where: { id: shipment.tour_id }, select: { subcontractor_id: true } })
        : null;
      rate = await this.findApplicableCostRate({
        rateType: 'MAIN_CARRIAGE',
        relationId: shipment.relation_id,
        subcontractorId: tour?.subcontractor_id ?? null,
      });
    }
    if (!rate) throw new NotFoundException(`Kostensatz für MAIN_CARRIAGE nicht gefunden`);

    const ratePer = this.toNumber(rate.rate_per_100kg);
    const min = this.toNumber(rate.min_charge);
    const raw = Math.round((chargeableWeight / 100) * ratePer * 100) / 100;
    const cost = Math.round(Math.max(raw, min) * 100) / 100;

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: { main_carriage_cost: cost },
    });

    return { shipmentId, mainCarriageCost: cost, rate };
  }

  async calculateOnCarriageCost(shipmentId: string) {
    const shipment = await this.loadShipmentForFpg(shipmentId);
    if (!shipment.chargeable_weight) {
      await this.calculateShipmentFPG(shipmentId);
    }

    const shipmentAfterFpg = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: { chargeable_weight: true },
    });

    const chargeableWeight = this.toNumber(shipmentAfterFpg?.chargeable_weight);
    const rate = await this.findOnCarriageRate({ relationId: shipment.relation_id });

    const ratePer = this.toNumber(rate.rate_per_100kg);
    const min = this.toNumber(rate.min_charge);
    const raw = Math.round((chargeableWeight / 100) * ratePer * 100) / 100;
    const cost = Math.round(Math.max(raw, min) * 100) / 100;

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: { on_carriage_cost: cost },
    });

    return { shipmentId, onCarriageCost: cost, rate };
  }

  async calculateAllCostsPreview(shipmentId: string) {
    const { shipment, fpg } = await this.computeShipmentFpgFromDb(shipmentId);

    // Determine which cost legs apply to this shipment
    const preActive = await this.prisma.pre_carriage_shipments.findFirst({
      where: { shipment_id: shipmentId },
      select: { id: true },
    });
    const mainActive = !!shipment.tour_id;

    const loadId = shipment.loading_address_id;
    const delivId = shipment.delivery_address_id;
    const addresses = await this.prisma.addresses.findMany({
      where: { id: { in: [loadId, delivId] } },
      select: { id: true, lat: true, lng: true },
    });

    const load = addresses.find((a) => a.id === loadId);
    const deliv = addresses.find((a) => a.id === delivId);
    const toNum = (d: any) => (d?.toNumber ? d.toNumber() : Number(d));
    if (load?.lat == null || load?.lng == null || deliv?.lat == null || deliv?.lng == null) {
      throw new BadRequestException(`Sendung ${shipmentId} hat fehlende Adresse-Koordinaten für LKM`);
    }

    const distanceKm = await this.fetchOsrmDistanceKm(
      toNum(load.lng),
      toNum(load.lat),
      toNum(deliv.lng),
      toNum(deliv.lat),
    );

    const customerFactor = await this.getCustomerFactorForShipment(shipmentId);
    const lkm = fpg.chargeableWeight * distanceKm * customerFactor;
    const costForLkm = lkm * this.EUR_PER_LKM;

    const preCarriageCost = preActive ? costForLkm : 0;
    const mainCarriageCost = mainActive ? costForLkm : 0;
    const onCarriageCost = 0;

    const totalCost = Math.round((preCarriageCost + mainCarriageCost + onCarriageCost) * 100) / 100;
    const freightRevenue = this.toNumber(shipment.freight_revenue);
    const contributionMargin = Math.round((freightRevenue - totalCost) * 100) / 100;
    const cmPercent = freightRevenue > 0 ? Math.round(((contributionMargin / freightRevenue) * 100) * 100) / 100 : 0;

    return {
      shipmentId,
      fpg: {
        actualWeight: fpg.actualWeight,
        cbm: fpg.cbm,
        volumeWeightCbm: fpg.volumeWeightCbm,
        volumeWeightLdm: fpg.volumeWeightLdm,
        chargeableWeight: fpg.chargeableWeight,
        calculationMethod: fpg.calculationMethod,
      },
      fpgMethod: fpg.calculationMethod,
      chargeableWeight: fpg.chargeableWeight,
      preCarriageCost,
      mainCarriageCost,
      onCarriageCost,
      totalCost,
      freightRevenue,
      contributionMargin,
      cmPercent,
    };
  }

  async calculateAllCosts(shipmentId: string) {
    // Recalculate relevant legs first (pre +/or main), then return the stored breakdown.
    const shipment = await this.prisma.shipments.findUnique({
      where: { id: shipmentId, deleted_at: null },
      select: { id: true, tour_id: true },
    });
    if (!shipment) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const preTours = await this.prisma.pre_carriage_shipments.findMany({
      where: { shipment_id: shipmentId },
      select: { pre_carriage_tour_id: true },
    });
    const preTourIds = [...new Set(preTours.map((x) => x.pre_carriage_tour_id).filter(Boolean))] as string[];

    // Pre leg
    for (const preTourId of preTourIds) {
      await this.recalculatePreCarriageTourCostsByLkm(preTourId);
    }

    // Main leg
    if (shipment.tour_id) {
      await this.recalculateMainTourCostsByLkm(shipment.tour_id);
    }

    const saved = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: {
        fpg_method: true,
        chargeable_weight: true,
        pre_carriage_cost: true,
        main_carriage_cost: true,
        on_carriage_cost: true,
        total_cost: true,
        freight_revenue: true,
        contribution_margin: true,
        cm_percent: true,
      },
    });

    if (!saved) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const chargeableWeight = this.toNumber(saved.chargeable_weight);
    const preCarriageCost = this.toNumber(saved.pre_carriage_cost);
    const mainCarriageCost = this.toNumber(saved.main_carriage_cost);
    const onCarriageCost = this.toNumber(saved.on_carriage_cost);
    const totalCost = this.toNumber(saved.total_cost);
    const freightRevenue = this.toNumber(saved.freight_revenue);

    const contributionMargin =
      saved.contribution_margin != null
        ? this.toNumber(saved.contribution_margin)
        : Math.round((freightRevenue - totalCost) * 100) / 100;
    const cmPercent =
      saved.cm_percent != null
        ? this.toNumber(saved.cm_percent)
        : freightRevenue > 0
          ? Math.round(((contributionMargin / freightRevenue) * 100) * 100) / 100
          : 0;

    return {
      shipmentId,
      fpg: {
        chargeableWeight,
        calculationMethod: saved.fpg_method ?? 'UNKNOWN',
      },
      fpgMethod: saved.fpg_method ?? 'UNKNOWN',
      chargeableWeight,
      preCarriageCost,
      mainCarriageCost,
      onCarriageCost,
      totalCost,
      freightRevenue,
      contributionMargin,
      cmPercent,
    };
  }

  async recalculateTourCosts(tourId: string | null | undefined) {
    if (!tourId) return;

    // Ensure main-leg costs are up-to-date according to LKM pricing.
    await this.recalculateMainTourCostsByLkm(tourId);

    const totals = await this.prisma.shipments.aggregate({
      where: { tour_id: tourId, deleted_at: null },
      _sum: { freight_revenue: true, total_cost: true, contribution_margin: true },
    });

    const totalRevenue = this.toNumber(totals._sum.freight_revenue);
    const totalCost = this.toNumber(totals._sum.total_cost);
    const contributionMargin = Math.round((totalRevenue - totalCost) * 100) / 100;
    const cmPercent = totalRevenue > 0 ? Math.round(((contributionMargin / totalRevenue) * 100) * 100) / 100 : 0;

    await this.prisma.tours.update({
      where: { id: tourId },
      data: {
        total_revenue: totalRevenue,
        subcontractor_cost: totalCost,
        contribution_margin: contributionMargin,
        cm_percent: cmPercent,
      },
    });
  }

  private async recalculateMainTourCostsByLkm(tourId: string) {
    const shipments = await this.prisma.shipments.findMany({
      where: { tour_id: tourId, deleted_at: null },
      select: {
        id: true,
        freight_revenue: true,
        pre_carriage_cost: true,
        main_carriage_cost: true,
        on_carriage_cost: true,
        business_partner_id: true,
        loading_address_id: true,
        delivery_address_id: true,
      },
    });

    if (shipments.length === 0) return;

    const toNum = (d: any) => (d?.toNumber ? d.toNumber() : Number(d));

    const bpIds = [...new Set(shipments.map((s) => s.business_partner_id).filter(Boolean))] as string[];
    const bps = await this.prisma.business_partners.findMany({
      where: { id: { in: bpIds } },
      select: { id: true, stacking_factor: true, avg_weight_per_stellplatz: true },
    });
    const bpFactorById: Record<string, number> = {};
    for (const bp of bps) {
      if (bp.stacking_factor == null || bp.avg_weight_per_stellplatz == null) continue;
      bpFactorById[bp.id] = (this.CUSTOMER_FACTOR_BASE * toNum(bp.stacking_factor)) / toNum(bp.avg_weight_per_stellplatz);
    }

    const addressIds = [
      ...new Set(
        shipments.flatMap((s) => [s.loading_address_id, s.delivery_address_id]).filter(Boolean),
      ),
    ] as string[];
    const addresses = await this.prisma.addresses.findMany({
      where: { id: { in: addressIds } },
      select: { id: true, lat: true, lng: true },
    });
    const addrById: Record<string, { lat: number; lng: number }> = {};
    for (const a of addresses) {
      if (a.lat == null || a.lng == null) continue;
      addrById[a.id] = { lat: toNum(a.lat), lng: toNum(a.lng) };
    }

    const distanceCache = new Map<string, number>();

    for (const s of shipments) {
      if (!s.business_partner_id) throw new BadRequestException(`Sendung ${s.id} hat kein business_partner_id`);
      const factor = bpFactorById[s.business_partner_id];
      if (!factor || !Number.isFinite(factor)) {
        throw new BadRequestException(`BusinessPartner ${s.business_partner_id} hat Stapelfaktor/Ø-Gewicht nicht gesetzt`);
      }

      const load = addrById[s.loading_address_id];
      const deliv = addrById[s.delivery_address_id];
      if (!load || !deliv) {
        throw new BadRequestException(`Sendung ${s.id} hat fehlende Koordinaten für LKM`);
      }

      const fpg = await this.calculateShipmentFPG(s.id);
      const chargeableWeight = fpg.chargeableWeight;

      const cacheKey = `${s.loading_address_id}|${s.delivery_address_id}`;
      let distanceKm = distanceCache.get(cacheKey);
      if (distanceKm == null) {
        distanceKm = await this.fetchOsrmDistanceKm(load.lng, load.lat, deliv.lng, deliv.lat);
        distanceCache.set(cacheKey, distanceKm);
      }

      const lkm = chargeableWeight * distanceKm * factor;
      const mainCost = Math.round(lkm * this.EUR_PER_LKM * 100) / 100;
      const preCost = this.toNumber(s.pre_carriage_cost);
      const onCost = 0;
      const totalCost = Math.round((preCost + mainCost + onCost) * 100) / 100;

      const freightRevenue = this.toNumber(s.freight_revenue);
      const contributionMargin = Math.round((freightRevenue - totalCost) * 100) / 100;
      const cmPercent =
        freightRevenue > 0 ? Math.round(((contributionMargin / freightRevenue) * 100) * 100) / 100 : 0;

      await this.prisma.shipments.update({
        where: { id: s.id },
        data: {
          main_carriage_cost: mainCost,
          on_carriage_cost: onCost,
          freight_cost: totalCost,
          total_cost: totalCost,
          contribution_margin: contributionMargin,
          cm_percent: cmPercent,
        },
      });
    }

  }

  private async recalculatePreCarriageTourCostsByLkm(preTourId: string) {
    const preTour = await this.prisma.pre_carriage_tours.findUnique({ where: { id: preTourId } });
    if (!preTour) throw new NotFoundException(`Vorlauftour ${preTourId} nicht gefunden`);

    const preCarriageItems = await this.prisma.pre_carriage_shipments.findMany({
      where: { pre_carriage_tour_id: preTourId },
      select: { id: true, shipment_id: true },
    });

    if (preCarriageItems.length === 0) {
      await this.prisma.pre_carriage_tours.update({
        where: { id: preTourId },
        data: { status: 'distributed', total_cost: 0 },
      });
      return;
    }

    const shipmentIds = preCarriageItems.map((x) => x.shipment_id);
    const shipments = await this.prisma.shipments.findMany({
      where: { id: { in: shipmentIds }, deleted_at: null },
      select: {
        id: true,
        tour_id: true,
        freight_revenue: true,
        pre_carriage_cost: true,
        main_carriage_cost: true,
        on_carriage_cost: true,
        business_partner_id: true,
        loading_address_id: true,
        delivery_address_id: true,
      },
    });

    const toNum = (d: any) => (d?.toNumber ? d.toNumber() : Number(d));

    const bpIds = [...new Set(shipments.map((s) => s.business_partner_id).filter(Boolean))] as string[];
    const bps = await this.prisma.business_partners.findMany({
      where: { id: { in: bpIds } },
      select: { id: true, stacking_factor: true, avg_weight_per_stellplatz: true },
    });
    const bpFactorById: Record<string, number> = {};
    for (const bp of bps) {
      if (bp.stacking_factor == null || bp.avg_weight_per_stellplatz == null) continue;
      bpFactorById[bp.id] = (this.CUSTOMER_FACTOR_BASE * toNum(bp.stacking_factor)) / toNum(bp.avg_weight_per_stellplatz);
    }

    const addressIds = [
      ...new Set(
        shipments.flatMap((s) => [s.loading_address_id, s.delivery_address_id]).filter(Boolean),
      ),
    ] as string[];
    const addresses = await this.prisma.addresses.findMany({
      where: { id: { in: addressIds } },
      select: { id: true, lat: true, lng: true },
    });
    const addrById: Record<string, { lat: number; lng: number }> = {};
    for (const a of addresses) {
      if (a.lat == null || a.lng == null) continue;
      addrById[a.id] = { lat: toNum(a.lat), lng: toNum(a.lng) };
    }

    const distanceCache = new Map<string, number>();

    let totalPreCost = 0;

    const shipmentById: Record<string, (typeof shipments)[number]> = {};
    for (const s of shipments) shipmentById[s.id] = s;

    // Update per pre-shipment row (because we must write allocated_cost).
    for (const item of preCarriageItems) {
      const s = shipmentById[item.shipment_id];
      if (!s) continue;
      if (!s.business_partner_id) throw new BadRequestException(`Sendung ${s.id} hat kein business_partner_id`);
      const factor = bpFactorById[s.business_partner_id];
      if (!factor || !Number.isFinite(factor)) {
        throw new BadRequestException(`BusinessPartner ${s.business_partner_id} hat Stapelfaktor/Ø-Gewicht nicht gesetzt`);
      }

      const load = addrById[s.loading_address_id];
      const deliv = addrById[s.delivery_address_id];
      if (!load || !deliv) {
        throw new BadRequestException(`Sendung ${s.id} hat fehlende Koordinaten für LKM`);
      }

      const fpg = await this.calculateShipmentFPG(s.id);
      const chargeableWeight = fpg.chargeableWeight;

      const cacheKey = `${s.loading_address_id}|${s.delivery_address_id}`;
      let distanceKm = distanceCache.get(cacheKey);
      if (distanceKm == null) {
        distanceKm = await this.fetchOsrmDistanceKm(load.lng, load.lat, deliv.lng, deliv.lat);
        distanceCache.set(cacheKey, distanceKm);
      }

      const lkm = chargeableWeight * distanceKm * factor;
      const preCost = Math.round(lkm * this.EUR_PER_LKM * 100) / 100;
      totalPreCost += preCost;

      const mainCost = this.toNumber(s.main_carriage_cost);
      const onCost = 0;
      const totalCost = Math.round((preCost + mainCost + onCost) * 100) / 100;

      const freightRevenue = this.toNumber(s.freight_revenue);
      const contributionMargin = Math.round((freightRevenue - totalCost) * 100) / 100;
      const cmPercent =
        freightRevenue > 0 ? Math.round(((contributionMargin / freightRevenue) * 100) * 100) / 100 : 0;

      await this.prisma.pre_carriage_shipments.update({
        where: { id: item.id },
        data: { allocated_cost: preCost, chargeable_weight: chargeableWeight },
      });

      await this.prisma.shipments.update({
        where: { id: s.id },
        data: {
          pre_carriage_cost: preCost,
          on_carriage_cost: onCost,
          freight_cost: totalCost,
          total_cost: totalCost,
          contribution_margin: contributionMargin,
          cm_percent: cmPercent,
        },
      });
    }

    await this.prisma.pre_carriage_tours.update({
      where: { id: preTourId },
      data: { status: 'distributed', total_cost: Math.round(totalPreCost * 100) / 100 },
    });

    const affectedMainTourIds = [
      ...new Set(shipments.map((s) => s.tour_id).filter(Boolean)),
    ] as string[];
    for (const tId of affectedMainTourIds) {
      await this.recalculateTourCosts(tId);
    }
  }

  async getRates() {
    return this.prisma.cost_rates.findMany({
      orderBy: [{ rate_type: 'asc' }, { name: 'asc' }],
    });
  }

  async createRate(dto: any) {
    return this.prisma.cost_rates.create({
      data: {
        rate_type: dto.rateType,
        name: dto.name,
        relation_id: dto.relationId ?? null,
        subcontractor_id: dto.subcontractorId ?? null,
        rate_per_100kg: dto.ratePer100kg,
        min_charge: dto.minCharge ?? 0,
        valid_from: dto.validFrom ? new Date(dto.validFrom) : undefined,
        valid_to: dto.validTo ? new Date(dto.validTo) : undefined,
        is_active: dto.isActive ?? true,
      },
    });
  }

  async updateRate(id: string, dto: any) {
    await this.prisma.cost_rates.findUnique({ where: { id } }).catch(() => null);
    return this.prisma.cost_rates.update({
      where: { id },
      data: {
        ...(dto.rateType !== undefined ? { rate_type: dto.rateType } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.relationId !== undefined ? { relation_id: dto.relationId } : {}),
        ...(dto.subcontractorId !== undefined ? { subcontractor_id: dto.subcontractorId } : {}),
        ...(dto.ratePer100kg !== undefined ? { rate_per_100kg: dto.ratePer100kg } : {}),
        ...(dto.minCharge !== undefined ? { min_charge: dto.minCharge } : {}),
        ...(dto.validFrom !== undefined ? { valid_from: dto.validFrom ? new Date(dto.validFrom) : null } : {}),
        ...(dto.validTo !== undefined ? { valid_to: dto.validTo ? new Date(dto.validTo) : null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
  }

  async getPreCarriageTours() {
    return this.prisma.pre_carriage_tours.findMany({
      orderBy: { tour_date: 'desc' },
      include: {
        subcontractors: true,
        cost_rates: true,
        pre_carriage_shipments: {
          include: {
            shipments: {
              select: {
                id: true,
                shipment_number: true,
                status: true,
                ldm: true,
                package_count: true,
                weight_kg: true,
                    length_cm: true,
                    width_cm: true,
                    height_cm: true,
                    chargeable_weight: true,
                    fpg_method: true,
                customers: { select: { name: true } },
                addresses_shipments_loading_address_idToaddresses: { select: { city: true, country_code: true } },
                addresses_shipments_delivery_address_idToaddresses: { select: { city: true, country_code: true } },
              },
            },
          },
        },
      },
    });
  }

  async createPreCarriageTour(dto: any, userId: string) {
    return this.prisma.pre_carriage_tours.create({
      data: {
        tour_date: new Date(dto.tourDate),
        subcontractor_id: dto.subcontractorId ?? null,
        total_cost: dto.totalCost ?? 0,
        cost_rate_id: dto.costRateId ?? null,
        distance_km: dto.distanceKm ?? null,
        notes: dto.notes ?? null,
        status: 'open',
        created_by: userId ?? null,
      },
    });
  }

  async addShipmentToPreCarriageTour(tourId: string, shipmentId: string) {
    const tour = await this.prisma.pre_carriage_tours.findUnique({ where: { id: tourId } });
    if (!tour) throw new NotFoundException(`Vorlauftour ${tourId} nicht gefunden`);

    const shipment = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: { id: true, deleted_at: true },
    });
    if (!shipment || shipment.deleted_at) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const existing = await this.prisma.pre_carriage_shipments.findFirst({
      where: { pre_carriage_tour_id: tourId, shipment_id: shipmentId },
    });
    if (existing) return existing;

    return this.prisma.pre_carriage_shipments.create({
      data: {
        pre_carriage_tour_id: tourId,
        shipment_id: shipmentId,
      },
    });
  }

  async distributePreCarriageTourCosts(tourId: string) {
    await this.recalculatePreCarriageTourCostsByLkm(tourId);
  }
}

