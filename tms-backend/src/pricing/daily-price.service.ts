import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerTariffService } from './customer-tariff.service';
import { num, roundMoney } from './pricing.utils';

export type PreviewDailyInput = {
  originCountry: string;
  destCountry: string;
  ldm: number;
  weightKg: number;
  relationId?: string | null;
  stopCount?: number;
};

export type ShipmentPricingPreviewInput = {
  customerId?: string | null;
  businessPartnerId?: string | null;
  originZip: string;
  originCountry: string;
  destZip: string;
  destCountry: string;
  ldm: number;
  weightKg: number;
  isHazmat?: boolean;
  stopCount?: number;
};

@Injectable()
export class DailyPriceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerTariff: CustomerTariffService,
  ) {}

  fetchTimocomRates(originCountry: string, destCountry: string) {
    return {
      pricePerLdm: 48.5,
      pricePerKm: 1.92,
      confidence: 0.15,
      connected: false,
      hint: 'Timocom API Key erforderlich – Mock-Werte',
      originCountry,
      destCountry,
    };
  }

  fetchDatRates(originCountry: string, destCountry: string) {
    return {
      pricePerLdm: 46.2,
      pricePerKm: 1.78,
      confidence: 0.12,
      connected: false,
      hint: 'DAT iQ API Key erforderlich – Mock-Werte',
      originCountry,
      destCountry,
    };
  }

  async getInternalRates(
    originCountry: string,
    destCountry: string,
    days = 90,
    relationId?: string | null,
  ) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const where: Prisma.shipmentsWhereInput = {
      deleted_at: null,
      created_at: { gte: since },
      addresses_shipments_loading_address_idToaddresses: {
        country_code: originCountry,
      },
      addresses_shipments_delivery_address_idToaddresses: {
        country_code: destCountry,
      },
    };
    if (relationId) where.relation_id = relationId;

    const rows = await this.prisma.shipments.findMany({
      where,
      select: { freight_revenue: true, ldm: true },
    });

    let sumRatio = 0;
    let sampleSize = 0;
    for (const r of rows) {
      const l = num(r.ldm);
      const rev = num(r.freight_revenue);
      if (l <= 0 || rev <= 0) continue;
      sumRatio += rev / l;
      sampleSize++;
    }
    const avgPricePerLdm = sampleSize > 0 ? sumRatio / sampleSize : 0;

    return {
      avgPricePerLdm: roundMoney(avgPricePerLdm),
      avgPricePerKm: 0,
      sampleSize,
    };
  }

  async countInternalSamples(originCountry: string, destCountry: string, days = 90) {
    const r = await this.getInternalRates(originCountry, destCountry, days, null);
    return r.sampleSize;
  }

  async getDailyPriceConfig(relationId: string | null) {
    if (relationId) {
      const row = await this.prisma.daily_price_config.findFirst({
        where: { relation_id: relationId },
      });
      if (row) return row;
    }
    const global = await this.prisma.daily_price_config.findFirst({
      where: { relation_id: null },
      orderBy: { id: 'asc' },
    });
    if (!global) {
      return {
        base_margin_pct: 25,
        market_delta_factor: 1,
        manual_surcharge_pct: 0,
        timocom_weight: 0.4,
        dat_weight: 0.3,
        internal_weight: 0.3,
      };
    }
    return global;
  }

  async listConfigs() {
    return this.prisma.daily_price_config.findMany({
      orderBy: [{ relation_id: 'asc' }],
      include: {
        relations: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async updateGlobalConfig(data: {
    base_margin_pct?: number;
    market_delta_factor?: number;
    manual_surcharge_pct?: number;
    timocom_weight?: number;
    dat_weight?: number;
    internal_weight?: number;
  }) {
    const row = await this.prisma.daily_price_config.findFirst({
      where: { relation_id: null },
      orderBy: { id: 'asc' },
    });
    if (!row) throw new NotFoundException('Keine globale Tagespreis-Konfiguration');
    return this.prisma.daily_price_config.update({
      where: { id: row.id },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
  }

  /** Heuristik für Live-Kalkulator / Neue-Sendung ohne gespeicherte Kostensätze */
  buildPreviewCosts(input: PreviewDailyInput) {
    const stops = input.stopCount ?? 3;
    const preCarriage = roundMoney(stops * 15);
    const mainCarriage = roundMoney(Math.max(0, input.ldm) * 10);
    const onCarriage = roundMoney(28 + (input.weightKg / 100) * 3);
    const totalCost = roundMoney(preCarriage + mainCarriage + onCarriage);
    return {
      preCarriage,
      mainCarriage,
      onCarriage,
      totalCost,
    };
  }

  private runMarginAlgorithm(
    costs: { totalCost: number },
    shipmentLdm: number,
    timocom: ReturnType<DailyPriceService['fetchTimocomRates']>,
    dat: ReturnType<DailyPriceService['fetchDatRates']>,
    internal: Awaited<ReturnType<DailyPriceService['getInternalRates']>>,
    config: Awaited<ReturnType<DailyPriceService['getDailyPriceConfig']>>,
  ) {
    const wT = num(config.timocom_weight, 0.4);
    const wD = num(config.dat_weight, 0.3);
    const wI = num(config.internal_weight, 0.3);
    const marketRate =
      num(timocom.pricePerLdm) * wT +
      num(dat.pricePerLdm) * wD +
      num(internal.avgPricePerLdm) * wI;

    const baseMarginPct = num(config.base_margin_pct, 25);
    const basePrice = costs.totalCost * (1 + baseMarginPct / 100);
    const marketValue = marketRate * shipmentLdm;
    const marketDelta = Math.max(0, marketValue - basePrice);
    const factor = num(config.market_delta_factor, 1);
    const dailyBeforeManual = basePrice + marketDelta * factor;
    const manualPct = num(config.manual_surcharge_pct, 0);
    const finalPrice = dailyBeforeManual * (1 + manualPct / 100);

    return {
      basePrice: roundMoney(basePrice),
      marketPrice: roundMoney(marketValue),
      marketDelta: roundMoney(marketDelta),
      dailyPriceBeforeManual: roundMoney(dailyBeforeManual),
      dailyPrice: roundMoney(finalPrice),
      weightedMarketRate: roundMoney(marketRate),
      breakdown: {
        timocomRate: timocom.pricePerLdm,
        datRate: dat.pricePerLdm,
        internalRate: internal.avgPricePerLdm,
        weightedMarketRate: marketRate,
      },
    };
  }

  async previewDailyPrice(input: PreviewDailyInput) {
    const costs = this.buildPreviewCosts(input);
    const timocom = this.fetchTimocomRates(input.originCountry, input.destCountry);
    const dat = this.fetchDatRates(input.originCountry, input.destCountry);
    const internal = await this.getInternalRates(
      input.originCountry,
      input.destCountry,
      90,
      input.relationId ?? null,
    );
    const config = await this.getDailyPriceConfig(input.relationId ?? null);
    const algo = this.runMarginAlgorithm(
      costs,
      input.ldm,
      timocom,
      dat,
      internal,
      config,
    );

    return {
      costs,
      ...algo,
      timocom,
      dat,
      internal,
      config: {
        base_margin_pct: num(config.base_margin_pct, 25),
        market_delta_factor: num(config.market_delta_factor, 1),
        manual_surcharge_pct: num(config.manual_surcharge_pct, 0),
        timocom_weight: num(config.timocom_weight, 0.4),
        dat_weight: num(config.dat_weight, 0.3),
        internal_weight: num(config.internal_weight, 0.3),
      },
    };
  }

  async calculateShipmentCostsFromDb(shipmentId: string) {
    const s = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: {
        pre_carriage_cost: true,
        main_carriage_cost: true,
        partner_on_carriage_cost: true,
        on_carriage_cost: true,
      },
    });
    if (!s) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);
    const on = num(s.partner_on_carriage_cost) || num(s.on_carriage_cost);
    const pre = num(s.pre_carriage_cost);
    const main = num(s.main_carriage_cost);
    return {
      preCarriage: pre,
      mainCarriage: main,
      onCarriage: on,
      totalCost: roundMoney(pre + main + on),
    };
  }

  async calculateDailyPrice(shipmentId: string, persist = true) {
    const shipment = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      include: {
        addresses_shipments_loading_address_idToaddresses: true,
        addresses_shipments_delivery_address_idToaddresses: true,
      },
    });
    if (!shipment) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const load = shipment.addresses_shipments_loading_address_idToaddresses;
    const del = shipment.addresses_shipments_delivery_address_idToaddresses;
    const originCountry = load?.country_code ?? 'DE';
    const destCountry = del?.country_code ?? 'DE';
    const ldm = num(shipment.ldm);

    const costs = await this.calculateShipmentCostsFromDb(shipmentId);
    const timocom = this.fetchTimocomRates(originCountry, destCountry);
    const dat = this.fetchDatRates(originCountry, destCountry);
    const internal = await this.getInternalRates(
      originCountry,
      destCountry,
      90,
      shipment.relation_id,
    );
    const config = await this.getDailyPriceConfig(shipment.relation_id);
    const algo = this.runMarginAlgorithm(costs, ldm, timocom, dat, internal, config);

    if (persist) {
      await this.prisma.shipments.update({
        where: { id: shipmentId },
        data: { daily_price: algo.dailyPrice },
      });
    }

    const erlös = num(shipment.freight_revenue);
    const dbPct =
      erlös > 0 ? roundMoney(((erlös - costs.totalCost) / erlös) * 100) : null;

    return {
      shipmentId,
      costs,
      basePrice: algo.basePrice,
      marketPrice: algo.marketPrice,
      marketDelta: algo.marketDelta,
      dailyPrice: algo.dailyPrice,
      breakdown: algo.breakdown,
      freightRevenue: erlös,
      dbPercent: dbPct,
    };
  }

  async previewShipmentPricing(input: ShipmentPricingPreviewInput) {
    const revenueResult = await this.customerTariff.previewRevenue({
      customerId: input.customerId,
      partnerId: input.businessPartnerId,
      originZip: input.originZip,
      originCountry: input.originCountry,
      destZip: input.destZip,
      destCountry: input.destCountry,
      weightKg: input.weightKg,
      ldm: input.ldm,
      isHazmat: input.isHazmat,
    });

    const daily = await this.previewDailyPrice({
      originCountry: input.originCountry,
      destCountry: input.destCountry,
      ldm: input.ldm,
      weightKg: input.weightKg,
      stopCount: input.stopCount,
    });

    const erlös = revenueResult.ok ? revenueResult.freightRevenue : 0;
    const kosten = daily.costs.totalCost;
    const dbPct =
      erlös > 0 ? roundMoney(((erlös - kosten) / erlös) * 100) : null;

    let dbAmpel: 'green' | 'yellow' | 'red' | 'gray' = 'gray';
    if (dbPct != null) {
      if (dbPct >= 15) dbAmpel = 'green';
      else if (dbPct >= 5) dbAmpel = 'yellow';
      else dbAmpel = 'red';
    }

    return {
      customerTariff: revenueResult,
      dailyPrice: daily,
      dbPercent: dbPct,
      dbAmpel,
    };
  }

  async marketRatesOverview() {
    const history = await this.prisma.market_price_history.findMany({
      orderBy: [{ recorded_at: 'desc' }],
      take: 30,
    });
    const internalTotal = await this.prisma.shipments.count({
      where: {
        deleted_at: null,
        created_at: {
          gte: new Date(Date.now() - 90 * 86400000),
        },
      },
    });
    return {
      timocom: {
        connected: false,
        hint: 'Timocom API Key in Einstellungen hinterlegen',
      },
      dat: {
        connected: false,
        hint: 'DAT iQ API Key in Einstellungen hinterlegen',
      },
      internal: {
        sampleShipmentsLast90Days: internalTotal,
        hint: 'Ø letzte 90 Tage (Länderkorridor in Kalkulation)',
      },
      history,
    };
  }
}
