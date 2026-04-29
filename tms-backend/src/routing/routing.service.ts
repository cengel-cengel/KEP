import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HallService } from '../hall/hall.service';

type RoutingDirection = 'INBOUND' | 'OUTBOUND';

@Injectable()
export class RoutingService {
  constructor(private prisma: PrismaService, private hall: HallService) {}

  private normalizeZip(zip: string): string {
    return zip.replace(/\s+/g, '').trim();
  }

  private zipToNumber(zip: string): number | null {
    const n = Number(this.normalizeZip(zip));
    return Number.isFinite(n) ? n : null;
  }

  private isRuleValidNow(rule: any): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!rule.is_active) return false;
    if (rule.valid_from && rule.valid_from > today) return false;
    if (rule.valid_to && rule.valid_to < today) return false;
    return true;
  }

  /**
   * Algorithmus wie in der Spezifikation:
   * 1) exakter PLZ-Bereich (zip_from/zip_to) + country
   * 2) PLZ-Prefix (zip_prefix) + country
   * 3) nur country (kein PLZ-Filter)
   * 4) sortiere nach priority DESC und nimm ersten Treffer
   * 5) falls kein Treffer: null
   */
  async findRoute(
    zip: string,
    countryCode: string,
    direction: RoutingDirection,
  ): Promise<any | null> {
    const zipNorm = this.normalizeZip(zip);
    const zipNum = this.zipToNumber(zipNorm);
    if (!countryCode || zipNorm.length === 0 || zipNum == null) return null;

    const candidates = await this.prisma.routing_rules.findMany({
      where: {
        country_code: countryCode,
        direction: { in: [direction, 'BOTH'] },
        is_active: true,
      },
      orderBy: { priority: 'desc' },
    });

    const validCandidates = candidates.filter((r) => this.isRuleValidNow(r));

    // 1) Exact range
    for (const r of validCandidates) {
      if (!r.zip_from || !r.zip_to) continue;
      const fromN = this.zipToNumber(r.zip_from);
      const toN = this.zipToNumber(r.zip_to);
      if (fromN == null || toN == null) continue;
      if (fromN <= zipNum && zipNum <= toN) return r;
    }

    // 2) Prefix
    for (const r of validCandidates) {
      if (!r.zip_prefix) continue;
      if (zipNorm.startsWith(r.zip_prefix)) return r;
    }

    // 3) Country only (kein PLZ-Filter)
    for (const r of validCandidates) {
      if (r.zip_from != null) continue;
      if (r.zip_to != null) continue;
      if (r.zip_prefix != null) continue;
      return r;
    }

    return null;
  }

  private timeToHHmm(t: Date | null | undefined): string | null {
    if (!t) return null;
    const h = String(t.getHours()).padStart(2, '0');
    const m = String(t.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  async testRouting(zip: string, countryCode: string, direction: string) {
    if (!['INBOUND', 'OUTBOUND', 'BOTH'].includes(direction)) return null;

    if (direction === 'BOTH') {
      const inbound = await this.findRoute(zip, countryCode, 'INBOUND');
      const outbound = await this.findRoute(zip, countryCode, 'OUTBOUND');
      return { inbound: inbound ? await this.mapRuleForTest(inbound) : null, outbound: outbound ? await this.mapRuleForTest(outbound) : null };
    }

    const route = await this.findRoute(
      zip,
      countryCode,
      direction as RoutingDirection,
    );
    return route ? this.mapRuleForTest(route) : null;
  }

  private async mapRuleForTest(rule: any) {
    let hall_location_code: string | null = null;
    if (rule.hall_location_id) {
      const hall = await this.prisma.hall_locations.findUnique({
        where: { id: rule.hall_location_id },
        select: { code: true },
      });
      hall_location_code = hall?.code ?? null;
    }

    return {
      id: rule.id,
      rule_name: rule.rule_name,
      direction: rule.direction,
      country_code: rule.country_code,
      zip_from: rule.zip_from,
      zip_to: rule.zip_to,
      zip_prefix: rule.zip_prefix,
      delivery_type: rule.delivery_type,
      partner_id: rule.partner_id,
      partner_name: rule.partner_name,
      gateway_name: rule.gateway_name,
      gateway_zip: rule.gateway_zip,
      gateway_city: rule.gateway_city,
      gateway_country: rule.gateway_country,
      transit_days: rule.transit_days,
      priority: rule.priority,
      departure_days: rule.departure_days,
      departure_time: this.timeToHHmm(rule.departure_time),
      cutoff_time: this.timeToHHmm(rule.cutoff_time),
      hall_location_code,
      is_active: rule.is_active,
      valid_from: rule.valid_from,
      valid_to: rule.valid_to,
    };
  }

  async findAllRules(filters: {
    direction?: string;
    country?: string;
    deliveryType?: string;
  }) {
    const where: any = {};

    if (filters.direction) {
      where.direction = { in: [filters.direction, 'BOTH'] };
    }
    if (filters.country) where.country_code = filters.country;
    if (filters.deliveryType) where.delivery_type = filters.deliveryType;

    return this.prisma.routing_rules.findMany({
      where,
      orderBy: { priority: 'desc' },
    });
  }

  async findRuleById(id: string) {
    return this.prisma.routing_rules.findUnique({ where: { id } });
  }

  async createRule(dto: any) {
    const departure_time = dto.departure_time
      ? new Date(`1970-01-01T${dto.departure_time}:00`)
      : undefined;
    const cutoff_time = dto.cutoff_time
      ? new Date(`1970-01-01T${dto.cutoff_time}:00`)
      : undefined;

    return this.prisma.routing_rules.create({
      data: {
        rule_name: dto.rule_name,
        direction: dto.direction,
        country_code: dto.country_code,
        zip_from: dto.zip_from ?? null,
        zip_to: dto.zip_to ?? null,
        zip_prefix: dto.zip_prefix ?? null,
        delivery_type: dto.delivery_type,
        partner_id: dto.partner_id ?? null,
        partner_name: dto.partner_name ?? null,
        gateway_name: dto.gateway_name ?? null,
        gateway_zip: dto.gateway_zip ?? null,
        gateway_city: dto.gateway_city ?? null,
        gateway_country: dto.gateway_country ?? null,
        transit_days: dto.transit_days ?? 1,
        priority: dto.priority ?? 10,
        departure_days: dto.departure_days ?? null,
        departure_time: departure_time ?? null,
        cutoff_time: cutoff_time ?? null,
        hall_location_id: dto.hall_location_id ?? null,
        is_active: dto.is_active ?? true,
        valid_from: dto.valid_from
          ? new Date(dto.valid_from)
          : undefined /* DB default */,
        valid_to: dto.valid_to ? new Date(dto.valid_to) : null,
      },
    });
  }

  async updateRule(id: string, dto: any) {
    const existing = await this.prisma.routing_rules.findUnique({
      where: { id },
    });
    if (!existing) throw new BadRequestException('Routing-Rule nicht gefunden');

    const departure_time = dto.departure_time
      ? new Date(`1970-01-01T${dto.departure_time}:00`)
      : undefined;
    const cutoff_time = dto.cutoff_time
      ? new Date(`1970-01-01T${dto.cutoff_time}:00`)
      : undefined;

    return this.prisma.routing_rules.update({
      where: { id },
      data: {
        ...(dto.rule_name !== undefined && { rule_name: dto.rule_name }),
        ...(dto.direction !== undefined && { direction: dto.direction }),
        ...(dto.country_code !== undefined && { country_code: dto.country_code }),
        ...(dto.zip_from !== undefined && { zip_from: dto.zip_from ?? null }),
        ...(dto.zip_to !== undefined && { zip_to: dto.zip_to ?? null }),
        ...(dto.zip_prefix !== undefined && { zip_prefix: dto.zip_prefix ?? null }),
        ...(dto.delivery_type !== undefined && {
          delivery_type: dto.delivery_type,
        }),
        ...(dto.partner_id !== undefined && { partner_id: dto.partner_id ?? null }),
        ...(dto.partner_name !== undefined && { partner_name: dto.partner_name ?? null }),
        ...(dto.gateway_name !== undefined && { gateway_name: dto.gateway_name ?? null }),
        ...(dto.gateway_zip !== undefined && { gateway_zip: dto.gateway_zip ?? null }),
        ...(dto.gateway_city !== undefined && { gateway_city: dto.gateway_city ?? null }),
        ...(dto.gateway_country !== undefined && { gateway_country: dto.gateway_country ?? null }),
        ...(dto.transit_days !== undefined && {
          transit_days: dto.transit_days ?? existing.transit_days,
        }),
        ...(dto.priority !== undefined && {
          priority: dto.priority ?? existing.priority,
        }),
        ...(dto.departure_days !== undefined && { departure_days: dto.departure_days ?? null }),
        ...(dto.departure_time !== undefined && { departure_time: departure_time ?? null }),
        ...(dto.cutoff_time !== undefined && { cutoff_time: cutoff_time ?? null }),
        ...(dto.hall_location_id !== undefined && { hall_location_id: dto.hall_location_id ?? null }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
        ...(dto.valid_from !== undefined && {
          valid_from: dto.valid_from
            ? new Date(dto.valid_from)
            : existing.valid_from,
        }),
        ...(dto.valid_to !== undefined && { valid_to: dto.valid_to ? new Date(dto.valid_to) : null }),
      },
    });
  }

  async deleteRule(id: string) {
    const existing = await this.prisma.routing_rules.findUnique({
      where: { id },
    });
    if (!existing) throw new BadRequestException('Routing-Rule nicht gefunden');

    return this.prisma.routing_rules.update({
      where: { id },
      data: { is_active: false, updated_at: new Date() },
    });
  }

  private async applyHallFromRule(
    shipmentId: string,
    rule: any,
    userId: string,
  ) {
    if (!rule.hall_location_id) return;

    const hallLocation = await this.prisma.hall_locations.findUnique({
      where: { id: rule.hall_location_id },
      select: { id: true, code: true },
    });
    if (!hallLocation) return;

    const activeStock = await this.prisma.hall_stock.findFirst({
      where: { shipment_id: shipmentId, removed_at: null },
      select: { hall_location_id: true },
    });

    if (!activeStock) {
      await this.hall.placeShipment(shipmentId, hallLocation.code, userId);
      return;
    }

    if (activeStock.hall_location_id === hallLocation.id) return;

    await this.hall.moveShipment(shipmentId, hallLocation.code, userId);
  }

  async autoRouteShipment(shipmentId: string, userId: string) {
    const shipment = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      include: {
        addresses_shipments_loading_address_idToaddresses: {
          select: { zip: true, country_code: true },
        },
        addresses_shipments_delivery_address_idToaddresses: {
          select: { zip: true, country_code: true },
        },
      },
    });

    if (!shipment) throw new BadRequestException('Sendung nicht gefunden');

    const loadingZip = shipment.addresses_shipments_loading_address_idToaddresses?.zip;
    const loadingCountry = shipment.addresses_shipments_loading_address_idToaddresses?.country_code;
    const deliveryZip = shipment.addresses_shipments_delivery_address_idToaddresses?.zip;
    const deliveryCountry = shipment.addresses_shipments_delivery_address_idToaddresses?.country_code;

    const inboundRule =
      loadingZip && loadingCountry
        ? await this.findRoute(loadingZip, loadingCountry, 'INBOUND')
        : null;

    const outboundRule =
      deliveryZip && deliveryCountry
        ? await this.findRoute(deliveryZip, deliveryCountry, 'OUTBOUND')
        : null;

    const inboundDeliveryType = inboundRule?.delivery_type ?? 'CHARTER';
    const outboundDeliveryType = outboundRule?.delivery_type ?? 'CHARTER';

    // Persist routing metadata
    const updated = await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        inbound_routing_id: inboundRule?.id ?? null,
        outbound_routing_id: outboundRule?.id ?? null,
        inbound_delivery_type: inboundDeliveryType,
        outbound_delivery_type: outboundDeliveryType,
        inbound_partner_name: inboundRule?.partner_name ?? null,
        outbound_partner_name: outboundRule?.partner_name ?? null,
      },
    });

    // Hall assignment (optional, best effort but matches rule hall_location_id)
    if (inboundRule) {
      try {
        await this.applyHallFromRule(shipmentId, inboundRule, userId);
      } catch {
        // If hall placement/move fails we don't want the whole routing to break the shipment save flow.
      }
    }
    if (outboundRule) {
      try {
        await this.applyHallFromRule(shipmentId, outboundRule, userId);
      } catch {
        // see note above
      }
    }

    return {
      inbound: inboundRule,
      outbound: outboundRule,
      shipment: updated,
    };
  }
}

