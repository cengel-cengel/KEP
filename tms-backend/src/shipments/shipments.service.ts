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

/**
 * Stack-aware Berechnung: SATTEL_HOEHE = 220cm.
 * Stapelbare Items teilen sich Stellplatz nach Höhe:
 *   heightFactor = floor(220 / item.height_cm)
 *   effective_pallets += quantity / max(1, heightFactor)
 * LDM nutzt denselben Faktor (statt fixer 0.5-Halbierung).
 */
const SATTEL_HOEHE = 220;

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
  /**
   * Map-Routing P1: classification-Ableitung bei Sendung-Create.
   * Heuristik via classifyShipment-lib (Gewicht/Sattel/PLZ-Gebiet).
   * PLZ-Gebiet-Match via nv_tour_gebiete.plz_pattern (lazy lookup).
   */
  private async deriveClassification(dto: {
    weightKg?: number | null;
    ldm?: number | null;
    transportType?: string | null;
    deliveryAddressId: string;
    packageLines?: Array<{ weightKg?: number | null }> | undefined;
  }): Promise<'SAMMELGUT' | 'CHARTER_UMSCHLAG' | 'CHARTER_DIREKT'> {
    const { classifyShipment } = await import(
      '../lib/shipmentClassification.lib'
    );
    // Gewicht: dto.weightKg ODER Σ packageLines
    let weight = dto.weightKg ?? 0;
    if ((!weight || weight === 0) && dto.packageLines?.length) {
      weight = dto.packageLines.reduce(
        (acc, l) => acc + Number(l.weightKg ?? 0),
        0,
      );
    }
    // Delivery-ZIP via address-lookup
    const addr = await this.prisma.addresses.findUnique({
      where: { id: dto.deliveryAddressId },
      select: { zip: true },
    });
    const zip = addr?.zip ?? null;
    // NV-Gebiet-Match (vereinfacht: PLZ-Prefix-Check gegen
    // nv_tour_gebiete.plz_pattern). Fallback false bei JSON-Mismatch.
    let isInOwnNvGebiet = false;
    if (zip) {
      const gebiete = await this.prisma.nv_tour_gebiete.findMany({
        where: { aktiv: true },
        select: { plz_pattern: true },
      });
      for (const g of gebiete) {
        if (!g.plz_pattern) continue;
        const pats: string[] = Array.isArray(g.plz_pattern)
          ? (g.plz_pattern as string[])
          : [];
        if (pats.some((p) => zip.startsWith(String(p)))) {
          isInOwnNvGebiet = true;
          break;
        }
      }
    }
    return classifyShipment({
      weight_kg: weight,
      ldm: dto.ldm ?? null,
      transport_type: dto.transportType ?? null,
      delivery_zip: zip,
      isInOwnNvGebiet,
    });
  }

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
        shipment_package_items: {
          select: { id: true, stackable: true, package_type: true },
        },
        relation: {
          select: { id: true, code: true, name: true, country_to: true },
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
        // R2.3: NV-Vorhol-Tour-Link (für 2-Tour-Sicht im Detail-Modal).
        // Liefert PICKUP-Stops mit nv_tour-Header + Stamm-Code.
        nv_tour_stops: {
          include: {
            nv_tour: {
              select: {
                id: true,
                datum: true,
                status: true,
                nv_stamm_tour: { select: { code: true, name: true } },
              },
            },
          },
        },
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
        partner_delivered: dto.partnerDelivered ?? false,
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
        // Map-Routing P1: classification override oder Auto-Ableitung
        // (BE-side per-call; PLZ-Gebiet-Check passiert in Service).
        classification:
          dto.classification ??
          (await this.deriveClassification(dto)),
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
        length_cm: dto.lengthCm,
        width_cm: dto.widthCm,
        height_cm: dto.heightCm,
        weight_kg: dto.weightKg,
        ldm: dto.ldm,
        volume_m3: dto.volumeM3,
        is_hazmat: dto.isHazmat,
        partner_delivered: dto.partnerDelivered,
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
  /** Setzt stackable auf ALLEN package_items der Sendung. */
  /**
   * Bulk-Patch fuer mehrere Sendungen: transportType,
   * relationId, stackable, tourId. Atomar via $transaction.
   */
  async bulkPatch(
    ids: string[],
    patch: {
      transportType?: string;
      relationId?: string | null;
      stackable?: boolean;
      tourId?: string | null;
    },
    _userId: string,
  ) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('ids darf nicht leer sein');
    }
    const data: Record<string, unknown> = {};
    if (patch.transportType !== undefined) data.transport_type = patch.transportType;
    if (patch.relationId !== undefined) data.relation_id = patch.relationId;
    if (patch.tourId !== undefined) {
      data.tour_id = patch.tourId;
      data.status = patch.tourId ? 'dispatched' : 'new';
    }
    if (Object.keys(data).length === 0 && patch.stackable === undefined) {
      throw new BadRequestException('patch enthaelt kein erlaubtes Feld');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      let updatedShipments = 0;
      if (Object.keys(data).length > 0) {
        const r = await tx.shipments.updateMany({
          where: { id: { in: ids }, deleted_at: null },
          data,
        });
        updatedShipments = r.count;
      }
      let updatedItems = 0;
      if (patch.stackable !== undefined) {
        const r2 = await tx.shipment_package_items.updateMany({
          where: { shipment_id: { in: ids } },
          data: { stackable: patch.stackable },
        });
        updatedItems = r2.count;
      }
      return { updatedShipments, updatedItems };
    });
    return { success: true, ids, ...result };
  }

  /**
   * Berechnet das Aggregat einer Sendung aus ihren Items
   * (Bounding-Box + Summen) und schreibt es in shipments.
   * Aufruf nach jedem Item-CRUD damit shipments-Aggregate
   * konsistent zur items-Tabelle bleibt.
   */
  async recalcAggregateForShipment(shipmentId: string) {
    const items = await this.prisma.shipment_package_items.findMany({
      where: { shipment_id: shipmentId },
      select: {
        length_cm: true,
        width_cm: true,
        height_cm: true,
        weight_kg: true,
        quantity: true,
        stackable: true,
      },
    });
    if (items.length === 0) return null;
    let maxL = 0;
    let maxW = 0;
    let maxH = 0;
    let totalKg = 0;
    let totalCount = 0;
    let totalCm3 = 0;
    let totalLdm = 0;
    let totalEffectivePallets = 0;
    for (const it of items) {
      const L = Number(it.length_cm) || 0;
      const W = Number(it.width_cm) || 0;
      const H = Number(it.height_cm) || 0;
      const kg = Number(it.weight_kg) || 0;
      const qty = Math.max(1, Number(it.quantity) || 1);
      if (L > maxL) maxL = L;
      if (W > maxW) maxW = W;
      if (H > maxH) maxH = H;
      totalKg += kg * qty;
      totalCount += qty;
      totalCm3 += L * W * H * qty;
      // Stack-aware Faktor: floor(SATTEL_HOEHE / item-höhe)
      // Beispiel: H=110cm → factor 2 (zwei übereinander),
      // H=80cm → factor 2 (220/80=2.75 → 2 sicher), H=220cm → 1.
      const heightFactor =
        it.stackable && H > 0 ? Math.floor(SATTEL_HOEHE / H) : 1;
      const denom = Math.max(1, heightFactor);
      totalEffectivePallets += qty / denom;
      totalLdm += (qty * L * W) / 24000 / denom;
    }
    return this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        length_cm: maxL || null,
        width_cm: maxW || null,
        height_cm: maxH || null,
        weight_kg: totalKg,
        package_count: totalCount,
        volume_m3: Math.round(totalCm3 / 1000) / 1000,
        ldm: Math.round(totalLdm * 100) / 100,
        effective_pallets: Math.round(totalEffectivePallets * 100) / 100,
      },
    });
  }

  /** Erstellt ein neues shipment_package_item. line_index auto-vergeben. */
  async createPackageItem(dto: {
    shipmentId: string;
    packageType?: string;
    quantity?: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    weightKg: number;
    stackable?: boolean;
  }) {
    const shipment = await this.prisma.shipments.findUnique({
      where: { id: dto.shipmentId },
      select: { id: true },
    });
    if (!shipment) {
      throw new NotFoundException(`Sendung ${dto.shipmentId} nicht gefunden`);
    }
    const last = await this.prisma.shipment_package_items.findFirst({
      where: { shipment_id: dto.shipmentId },
      orderBy: { line_index: 'desc' },
      select: { line_index: true },
    });
    const nextIndex = (last?.line_index ?? 0) + 1;
    const created = await this.prisma.shipment_package_items.create({
      data: {
        shipment_id: dto.shipmentId,
        line_index: nextIndex,
        package_type: (dto.packageType ?? 'pallet_euro') as any,
        quantity: dto.quantity ?? 1,
        length_cm: dto.lengthCm,
        width_cm: dto.widthCm,
        height_cm: dto.heightCm,
        weight_kg: dto.weightKg,
        stackable: dto.stackable ?? true,
      },
    });
    await this.recalcAggregateForShipment(dto.shipmentId);
    return created;
  }

  async updatePackageItem(
    itemId: string,
    dto: {
      packageType?: string;
      quantity?: number;
      lengthCm?: number;
      widthCm?: number;
      heightCm?: number;
      weightKg?: number;
      stackable?: boolean;
    },
  ) {
    const item = await this.prisma.shipment_package_items.findUnique({
      where: { id: itemId },
      select: { id: true, shipment_id: true },
    });
    if (!item) {
      throw new NotFoundException(`Package-Item ${itemId} nicht gefunden`);
    }
    const data: Record<string, unknown> = {};
    if (dto.packageType !== undefined) data.package_type = dto.packageType;
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.lengthCm !== undefined) data.length_cm = dto.lengthCm;
    if (dto.widthCm !== undefined) data.width_cm = dto.widthCm;
    if (dto.heightCm !== undefined) data.height_cm = dto.heightCm;
    if (dto.weightKg !== undefined) data.weight_kg = dto.weightKg;
    if (dto.stackable !== undefined) data.stackable = dto.stackable;
    const updated = await this.prisma.shipment_package_items.update({
      where: { id: itemId },
      data,
    });
    await this.recalcAggregateForShipment(item.shipment_id);
    return updated;
  }

  async deletePackageItem(itemId: string) {
    const item = await this.prisma.shipment_package_items.findUnique({
      where: { id: itemId },
      select: { id: true, shipment_id: true },
    });
    if (!item) {
      throw new NotFoundException(`Package-Item ${itemId} nicht gefunden`);
    }
    await this.prisma.shipment_package_items.delete({ where: { id: itemId } });
    await this.recalcAggregateForShipment(item.shipment_id);
    return { success: true };
  }

  async setStackable(id: string, stackable: boolean) {
    const shipment = await this.prisma.shipments.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!shipment) {
      throw new NotFoundException(`Sendung ${id} nicht gefunden`);
    }
    await this.prisma.shipment_package_items.updateMany({
      where: { shipment_id: id },
      data: { stackable },
    });
    return this.findOne(id);
  }

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
