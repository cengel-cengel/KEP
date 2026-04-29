// ============================================================
// TMS – Shipments Service (Kern-Businesslogik)
// src/shipments/shipments.service.ts
// ============================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConditionsService } from '../conditions/conditions.service';
import { AuditService } from '../audit/audit.service';
import { RelationsService } from '../relations/relations.service';
import { HallService } from '../hall/hall.service';
import { RoutingService } from '../routing/routing.service';
import { StatusService } from '../status/status.service';
import { CostsService } from '../costs/costs.service';
import { PricingHubService } from '../pricing-hub/pricing-hub.service';
import { aggregatePackageLines } from '../costs/freight-weight.calculator';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { DispatchShipmentDto } from './dto/dispatch-shipment.dto';

@Injectable()
export class ShipmentsService {
  constructor(
    private prisma: PrismaService,
    private conditions: ConditionsService,
    private audit: AuditService,
    private relations: RelationsService,
    private hall: HallService,
    private routing: RoutingService,
    private statusSvc: StatusService,
    private costs: CostsService,
    private pricingHub: PricingHubService,
  ) {}

  // ── Sendungsnummer generieren ─────────────────────────────
  private async generateShipmentNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('shipment_number_seq')
    `;
    const year = new Date().getFullYear().toString().slice(-2);
    return `S${year}-${result[0].nextval.toString().padStart(6, '0')}`;
  }

  // ── Alle Sendungen für Dispo-Board ───────────────────────
  async findAll(filters: {
    status?: string[];
    customerId?: string;
    plz?: string;
    loadingDateFrom?: Date;
    loadingDateTo?: Date;
    tourId?: string | null;
    transportType?: string;
    search?: string;
  }) {
    const where: any = {
      deleted_at: null,
    };

    if (filters.status?.length) {
      where.status = { in: filters.status };
    }
    if (filters.transportType) {
      where.transport_type = filters.transportType;
    }
    if (filters.customerId) {
      where.customer_id = filters.customerId;
    }
    if (filters.loadingDateFrom || filters.loadingDateTo) {
      where.loading_date = {};
      if (filters.loadingDateFrom)
        where.loading_date.gte = filters.loadingDateFrom;
      if (filters.loadingDateTo) where.loading_date.lte = filters.loadingDateTo;
    }
    if (filters.tourId === null) {
      where.tour_id = null;
    } else if (filters.tourId) {
      where.tour_id = filters.tourId;
    }

    const andConditions: any[] = [];
    if (filters.search) {
      andConditions.push({
        OR: [
          {
            shipment_number: { contains: filters.search, mode: 'insensitive' },
          },
          { customer_ref: { contains: filters.search, mode: 'insensitive' } },
          {
            customers: {
              name: { contains: filters.search, mode: 'insensitive' },
            },
          },
          {
            business_partner: {
              name: { contains: filters.search, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    if (filters.plz && filters.plz.trim()) {
      const term = filters.plz.trim();
      andConditions.push({
        OR: [
          {
            addresses_shipments_loading_address_idToaddresses: {
              zip: { contains: term, mode: 'insensitive' },
            },
          },
          {
            addresses_shipments_delivery_address_idToaddresses: {
              zip: { contains: term, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    return this.prisma.shipments.findMany({
      where,
      include: {
        customers: {
          select: { id: true, name: true, min_contribution_pct: true },
        },
        business_partner: {
          select: { id: true, name: true, partner_number: true },
        },
        addresses_shipments_loading_address_idToaddresses: {
          select: {
            id: true,
            name: true,
            city: true,
            zip: true,
            country_code: true,
          },
        },
        addresses_shipments_delivery_address_idToaddresses: {
          select: {
            id: true,
            name: true,
            city: true,
            zip: true,
            country_code: true,
          },
        },
        inbound_routing: {
          select: {
            id: true,
            rule_name: true,
            delivery_type: true,
            partner_name: true,
          },
        },
        outbound_routing: {
          select: {
            id: true,
            rule_name: true,
            delivery_type: true,
            partner_name: true,
          },
        },
        tours: {
          select: {
            id: true,
            tour_number: true,
            status: true,
            total_revenue: true,
            subcontractor_cost: true,
            closed_at: true,
            completed_at: true,
          },
        },
        pre_carriage_shipments: {
          include: {
            pre_carriage_tours: {
              select: {
                id: true,
                tour_date: true,
                total_cost: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: [{ loading_date: 'asc' }, { created_at: 'asc' }],
    });
  }

  // ── Sendungen mit Koordinaten für Karte ───────────────────
  async getMap(filters?: {
    status?: string[];
    transportType?: string;
    search?: string;
    tourId?: string | null;
  }) {
    const where: any = {
      deleted_at: null,
      status: { not: 'cancelled' },
    };
    if (filters?.status?.length) where.status = { in: filters.status };
    if (filters?.transportType) where.transport_type = filters.transportType;
    if (filters?.tourId !== undefined) {
      where.tour_id = filters.tourId;
    }
    if (filters?.search) {
      where.OR = [
        { shipment_number: { contains: filters.search, mode: 'insensitive' } },
        { customer_ref: { contains: filters.search, mode: 'insensitive' } },
        {
          customers: {
            name: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          business_partner: {
            name: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          addresses_shipments_loading_address_idToaddresses: {
            zip: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          addresses_shipments_delivery_address_idToaddresses: {
            zip: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }
    return this.prisma.shipments.findMany({
      where,
      select: {
        id: true,
        shipment_number: true,
        status: true,
        freight_revenue: true,
        contribution_margin: true,
        cm_percent: true,
        pre_carriage_cost: true,
        main_carriage_cost: true,
        on_carriage_cost: true,
        total_cost: true,
        tour_id: true,
        tour_position: true,
        ldm: true,
        outbound_delivery_type: true,
        inbound_delivery_type: true,
        customers: { select: { name: true } },
        addresses_shipments_loading_address_idToaddresses: {
          select: { id: true, lat: true, lng: true, city: true, name: true },
        },
        addresses_shipments_delivery_address_idToaddresses: {
          select: { id: true, lat: true, lng: true, city: true, name: true },
        },
      },
      orderBy: [
        { tour_id: 'asc' },
        { tour_position: 'asc' },
        { loading_date: 'asc' },
      ],
    });
  }

  // ── Einzelne Sendung ─────────────────────────────────────
  async findOne(id: string) {
    const shipment = await this.prisma.shipments.findFirst({
      where: { id, deleted_at: null },
      include: {
        customers: true,
        business_partner: true,
        addresses_shipments_loading_address_idToaddresses: true,
        addresses_shipments_delivery_address_idToaddresses: true,
        tours: { include: { subcontractors: true } },
        conditions: { include: { condition_rates: true } },
        shipment_package_items: { orderBy: { line_index: 'asc' } },
        shipment_events: { orderBy: { created_at: 'desc' }, take: 10 },
      },
    });

    if (!shipment) throw new NotFoundException(`Sendung ${id} nicht gefunden`);
    return shipment;
  }

  /** Aus partner_locations eine Lade-Adresse (addresses) für die Sendung ableiten */
  private async snapshotLoadingAddressFromPartnerLocation(
    dto: CreateShipmentDto,
  ): Promise<string> {
    const plId = dto.loadingPartnerLocationId;
    if (!plId) {
      throw new BadRequestException('loadingPartnerLocationId fehlt');
    }
    const pl = await this.prisma.partner_locations.findUnique({
      where: { id: plId },
    });
    if (!pl)
      throw new NotFoundException(
        'Ladestelle (Partner-Standort) nicht gefunden',
      );
    if (dto.partnerId && pl.partner_id !== dto.partnerId) {
      throw new BadRequestException(
        'Ladestelle passt nicht zum gewählten Geschäftspartner',
      );
    }

    const addr = await this.prisma.addresses.create({
      data: {
        customer_id: dto.customerId ?? null,
        type: 'loading',
        name: pl.name,
        name2: pl.name2 ?? undefined,
        street: pl.street,
        zip: pl.zip,
        city: pl.city,
        country_code: pl.country_code ?? 'DE',
        contact_name: pl.contact_name ?? undefined,
        contact_phone: pl.contact_phone ?? undefined,
        contact_email: pl.contact_email ?? undefined,
        notes: pl.special_instructions ?? undefined,
      },
    });
    return addr.id;
  }

  private async resolveLoadingAddressId(
    dto: CreateShipmentDto,
  ): Promise<string> {
    if (dto.loadingAddressId && dto.loadingPartnerLocationId) {
      throw new BadRequestException(
        'Nur eine Ladeadresse angeben (Adresse oder Partner-Ladestelle).',
      );
    }
    if (dto.loadingAddressId) {
      return dto.loadingAddressId;
    }
    if (dto.loadingPartnerLocationId) {
      if (!dto.partnerId) {
        throw new BadRequestException(
          'Partner-Ladestelle erfordert partnerId (Stammdaten-Partner).',
        );
      }
      return this.snapshotLoadingAddressFromPartnerLocation(dto);
    }
    throw new BadRequestException('Ladeadresse fehlt.');
  }

  // ── Sendung erstellen ────────────────────────────────────
  async create(dto: CreateShipmentDto, userId: string) {
    if (!dto.customerId && !dto.partnerId) {
      throw new BadRequestException(
        'Bitte einen Kunden oder einen Stammdaten-Geschäftspartner auswählen.',
      );
    }

    const loading_address_id = await this.resolveLoadingAddressId(dto);
    const shipmentNumber = await this.generateShipmentNumber();

    const condition = await this.conditions.findBestCondition({
      customerId: dto.customerId,
      loadingCountry: dto.loadingCountryCode,
      deliveryCountry: dto.deliveryCountryCode,
      date: new Date(dto.loadingDate),
    });

    const hasLines = !!(dto.packageLines && dto.packageLines.length > 0);
    let packageType = dto.packageType;
    let packageCount = dto.packageCount;
    let weightKg = dto.weightKg;
    let ldm = dto.ldm;
    let lengthCm = dto.lengthCm;
    let widthCm = dto.widthCm;
    let heightCm = dto.heightCm;
    let volumeM3 = dto.volumeM3;

    if (hasLines) {
      const lines = dto.packageLines!;
      const agg = aggregatePackageLines(
        lines.map((l) => ({
          quantity: l.quantity,
          length_cm: l.lengthCm,
          width_cm: l.widthCm,
          height_cm: l.heightCm,
          weight_kg: l.weightKg,
          stackable: l.stackable,
        })),
      );
      packageType = lines[0].packageType;
      packageCount = agg.totalQuantity;
      weightKg = agg.totalWeightKg;
      ldm = agg.ldm;
      lengthCm = agg.maxLengthCm;
      widthCm = agg.maxWidthCm;
      heightCm = agg.maxHeightCm;
      volumeM3 = agg.cbm;
    } else if (
      packageType == null ||
      packageCount == null ||
      weightKg == null
    ) {
      throw new BadRequestException(
        'Packstückdaten: packageLines (mehrzeilig) oder packageType, packageCount und weightKg angeben.',
      );
    }

    let freight_revenue = 0;
    if (condition) {
      freight_revenue = await this.conditions.calculateFreight(condition.id, {
        weightKg: weightKg!,
        ldm: ldm ?? undefined,
        packageCount: packageCount!,
      });
    }

    const shipment = await this.prisma.shipments.create({
      data: {
        shipment_number: shipmentNumber,
        transport_type: dto.transportType ?? 'DIREKT',
        customer_id: dto.customerId ?? null,
        business_partner_id: dto.partnerId ?? null,
        customer_ref: dto.customerRef,
        status: 'new',
        loading_address_id,
        delivery_address_id: dto.deliveryAddressId,
        loading_date: new Date(dto.loadingDate),
        ...(dto.loadingTimeFrom != null && {
          loading_time_from: new Date(`1970-01-01T${dto.loadingTimeFrom}:00`),
        }),
        ...(dto.loadingTimeTo != null && {
          loading_time_to: new Date(`1970-01-01T${dto.loadingTimeTo}:00`),
        }),
        delivery_date: new Date(dto.deliveryDate),
        ...(dto.deliveryTimeFrom != null && {
          delivery_time_from: new Date(`1970-01-01T${dto.deliveryTimeFrom}:00`),
        }),
        ...(dto.deliveryTimeTo != null && {
          delivery_time_to: new Date(`1970-01-01T${dto.deliveryTimeTo}:00`),
        }),
        package_type: packageType as any,
        package_count: packageCount!,
        weight_kg: weightKg!,
        ldm,
        volume_m3: volumeM3,
        height_cm: heightCm,
        length_cm: lengthCm,
        width_cm: widthCm,
        ...(hasLines
          ? {
              shipment_package_items: {
                create: dto.packageLines!.map((l, i) => ({
                  line_index: i,
                  package_type: l.packageType as any,
                  quantity: l.quantity,
                  length_cm: l.lengthCm,
                  width_cm: l.widthCm,
                  height_cm: l.heightCm,
                  weight_kg: l.weightKg,
                  stackable: l.stackable,
                })),
              },
            }
          : {}),
        is_hazmat: dto.isHazmat ?? false,
        hazmat_class: dto.hazmatClass,
        hazmat_un_number: dto.hazmatUnNumber,
        hazmat_packing_group: dto.hazmatPackingGroup,
        hazmat_description: dto.hazmatDescription,
        incoterm: dto.incoterm,
        freight_payer: (dto.freightPayer ?? 'sender') as any,
        condition_id: condition?.id,
        freight_revenue,
        comment: dto.comment,
        customer_note: dto.customerNote,
        created_by: userId,
      },
      include: {
        customers: { select: { name: true } },
        business_partner: {
          select: { id: true, name: true, partner_number: true },
        },
        addresses_shipments_loading_address_idToaddresses: true,
        addresses_shipments_delivery_address_idToaddresses: true,
      },
    });

    await this.audit.log({
      tableName: 'shipments',
      recordId: shipment.id,
      action: 'INSERT',
      newValues: shipment,
      userId,
    });

    await this.statusSvc.addEvent(shipment.id, 'ERFASST', {
      userId,
      isAutomatic: true,
    });

    // Sprint 9: Automatic relation assignment + optional hall placement
    const deliveryAddress =
      shipment.addresses_shipments_delivery_address_idToaddresses as any;
    const assignment = await this.relations.autoAssignRelation({
      zipTo: deliveryAddress?.zip ?? null,
      countryTo: deliveryAddress?.country_code ?? dto.deliveryCountryCode,
    });

    if (assignment) {
      await this.prisma.shipments.update({
        where: { id: shipment.id },
        data: { relation_id: assignment.relationId },
      });

      if (assignment.hallLocationCode) {
        await this.hall.placeShipment(
          shipment.id,
          assignment.hallLocationCode,
          userId,
        );
      }
    }

    await this.routing.autoRouteShipment(shipment.id, userId);
    try {
      if (await this.pricingHub.shouldUseHub()) {
        const prev = await this.prisma.shipments.findUnique({
          where: { id: shipment.id },
          select: { freight_revenue: true },
        });

        const result = await this.pricingHub.calculateShipmentPricing(shipment.id);
        // Fallback, wenn der Hub ohne passende Regeln keine sinnvollen Werte liefern konnte.
        if (result?.customerRevenue?.totalAmount == null || result.customerRevenue.totalAmount === 0) {
          await this.prisma.shipments.update({
            where: { id: shipment.id },
            data: { freight_revenue: prev?.freight_revenue ?? null },
          });
          await this.costs.applyRelationTariffEconomics(shipment.id);
        }
      } else {
        await this.costs.applyRelationTariffEconomics(shipment.id);
      }
    } catch {
      // Bei fehlenden Hub-Regeln oder Rechenfehlern bleibt die alte Kalkulation aktiv.
      await this.costs.applyRelationTariffEconomics(shipment.id).catch(() => undefined);
    }
    return this.findOne(shipment.id);
  }

  // ── Sendung aktualisieren ────────────────────────────────
  async update(id: string, dto: UpdateShipmentDto, userId: string) {
    const existing = await this.findOne(id);

    const updated = await this.prisma.shipments.update({
      where: { id },
      data: {
        ...(dto.transportType !== undefined && {
          transport_type: dto.transportType,
        }),
        customer_ref: dto.customerRef,
        loading_address_id: dto.loadingAddressId,
        delivery_address_id: dto.deliveryAddressId,
        loading_date: dto.loadingDate ? new Date(dto.loadingDate) : undefined,
        loading_time_from: dto.loadingTimeFrom,
        loading_time_to: dto.loadingTimeTo,
        delivery_date: dto.deliveryDate
          ? new Date(dto.deliveryDate)
          : undefined,
        delivery_time_from: dto.deliveryTimeFrom,
        delivery_time_to: dto.deliveryTimeTo,
        package_type: dto.packageType as any,
        package_count: dto.packageCount,
        weight_kg: dto.weightKg,
        ldm: dto.ldm,
        volume_m3: dto.volumeM3,
        is_hazmat: dto.isHazmat,
        hazmat_class: dto.hazmatClass,
        hazmat_un_number: dto.hazmatUnNumber,
        hazmat_packing_group: dto.hazmatPackingGroup,
        hazmat_description: dto.hazmatDescription,
        incoterm: dto.incoterm,
        freight_payer: dto.freightPayer as any,
        comment: dto.comment,
        customer_note: dto.customerNote,
      },
      include: {
        customers: { select: { name: true } },
        addresses_shipments_loading_address_idToaddresses: true,
        addresses_shipments_delivery_address_idToaddresses: true,
      },
    });

    await this.audit.log({
      tableName: 'shipments',
      recordId: id,
      action: 'UPDATE',
      oldValues: existing,
      newValues: updated,
      userId,
    });

    const addressChanged =
      dto.loadingAddressId !== undefined || dto.deliveryAddressId !== undefined;

    if (addressChanged) {
      const routed = await this.routing.autoRouteShipment(id, userId);
      return routed.shipment;
    }

    return updated;
  }

  // ── Sendung disponieren (Tour zuordnen) ──────────────────
  async dispatch(id: string, dto: DispatchShipmentDto, userId: string) {
    const shipment = await this.findOne(id);

    if (shipment.status === 'invoiced') {
      throw new BadRequestException(
        'Fakturierte Sendungen können nicht mehr disponiert werden',
      );
    }

    if ((shipment as { has_active_lock?: boolean }).has_active_lock) {
      const lt =
        (shipment as { lock_types?: string | null }).lock_types ?? 'Sperre';
      throw new BadRequestException(
        `Sendung gesperrt (${lt}) – Sperre aufheben bevor disponieren`,
      );
    }

    if (dto.tourId) {
      const tour = await this.prisma.tours.findUnique({
        where: { id: dto.tourId },
        include: {
          shipments: { where: { deleted_at: null } },
          subcontractors: true,
        },
      });

      if (!tour)
        throw new NotFoundException(`Tour ${dto.tourId} nicht gefunden`);

      const currentLdm = tour.shipments.reduce(
        (sum, s) => sum + (Number(s.ldm) || 0),
        0,
      );
      const newLdm = currentLdm + (Number(shipment.ldm) || 0);

      if (newLdm > Number(tour.max_ldm)) {
        throw new BadRequestException(
          `Tour überladen: ${newLdm.toFixed(2)} ldm > Max ${tour.max_ldm} ldm`,
        );
      }

      if (shipment.is_hazmat && !tour.subcontractors?.has_adr_license) {
        throw new BadRequestException(
          'Subunternehmer hat keine ADR-Zulassung für Gefahrgut-Sendungen',
        );
      }
    }

    const updated = await this.prisma.shipments.update({
      where: { id },
      data: {
        tour_id: dto.tourId,
        tour_position: dto.tourPosition,
        status: dto.tourId ? 'dispatched' : 'new',
      },
    });

    await this.audit.log({
      tableName: 'shipments',
      recordId: id,
      action: 'UPDATE',
      oldValues: { tour_id: shipment.tour_id },
      newValues: { tour_id: dto.tourId },
      userId,
    });

    if (dto.tourId) {
      await this.statusSvc.addEvent(id, 'DISPONIERT', {
        userId,
        isAutomatic: true,
      });
    }

    return updated;
  }

  // ── Massenauflösung aus Tour ──────────────────────────────
  async bulkDispatch(shipmentIds: string[], tourId: string, userId: string) {
    const results = await Promise.allSettled(
      shipmentIds.map((id, index) =>
        this.dispatch(id, { tourId, tourPosition: index + 1 }, userId),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results
      .filter((r) => r.status === 'rejected')
      .map((r: any) => r.reason?.message);

    return { succeeded, failed };
  }

  // ── Sendung soft-löschen ─────────────────────────────────
  async remove(id: string, userId: string) {
    const shipment = await this.findOne(id);

    if (['invoiced', 'in_transit'].includes(shipment.status)) {
      throw new BadRequestException(
        `Sendungen im Status '${shipment.status}' können nicht gelöscht werden`,
      );
    }

    await this.prisma.shipments.update({
      where: { id },
      data: { deleted_at: new Date(), tour_id: null },
    });

    await this.audit.log({
      tableName: 'shipments',
      recordId: id,
      action: 'DELETE',
      oldValues: shipment,
      userId,
    });

    return { success: true };
  }

  // ── Preis-Vorschau (für Live-Berechnung im UI) ───────────
  async previewPrice(dto: {
    customerId?: string;
    loadingCountryCode: string;
    deliveryCountryCode: string;
    loadingDate: string;
    weightKg: number;
    ldm?: number;
    packageCount?: number;
  }) {
    if (!dto.customerId) {
      return {
        conditionFound: false,
        freightRevenue: 0,
        message:
          'Preisvorschau nur mit klassischem Kundenkonto (Tarife) – Stammdaten-Partner ohne Kondition.',
      };
    }

    const condition = await this.conditions.findBestCondition({
      customerId: dto.customerId,
      loadingCountry: dto.loadingCountryCode,
      deliveryCountry: dto.deliveryCountryCode,
      date: new Date(dto.loadingDate),
    });

    if (!condition) {
      return {
        conditionFound: false,
        freightRevenue: 0,
        message: 'Keine Kondition gefunden – bitte manuell eintragen',
      };
    }

    const freightRevenue = await this.conditions.calculateFreight(
      condition.id,
      {
        weightKg: dto.weightKg,
        ldm: dto.ldm,
        packageCount: dto.packageCount,
      },
    );

    return {
      conditionFound: true,
      conditionId: condition.id,
      conditionName: condition.name,
      basis: condition.basis,
      fuelSurchargePct: condition.fuel_surcharge_pct,
      freightRevenue,
      breakdown: {
        basePrice:
          freightRevenue / (1 + Number(condition.fuel_surcharge_pct) / 100),
        fuelSurcharge:
          freightRevenue -
          freightRevenue / (1 + Number(condition.fuel_surcharge_pct) / 100),
        total: freightRevenue,
      },
    };
  }
}
