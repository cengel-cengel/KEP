import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { UpdateTourDto } from './dto/update-tour.dto';
import { DocumentsService } from '../documents/documents.service';
import { LockService } from '../status/lock.service';
import { StatusService } from '../status/status.service';
import { routeDistanceKm, routeOnly, routeTrip } from '../lib/osrm.lib';
import { getNvPlzSet } from '../lib/nv-plz.lib';
import { computeOverload, formatOverloadMessage } from '../lib/capacity.lib';
import {
  computeEffectiveLdm,
  isShipmentFullyStackable,
} from '../lib/stackable.lib';
import {
  findBestToursForShipment,
  findBestToursForShipmentPrecise,
  type MatchTourCandidate,
} from '../lib/tourMatcher.lib';
import { computeFvSchedule } from './fv-scheduler.lib';

/**
 * Transport-Types die in /tours/eligible-shipments-fv landen.
 * P0-7: DIREKT + DIREKT_UMSCHLAG + BEILADER + SONDER sind FV-fähig
 * sofern PICKUP-completed (in NV-Gebiet) ODER Charter (outside).
 * EXPLIZIT NICHT-FV: ABHOLUNG_UMSCHLAG, SELBST.
 * Export für Regression-Tests (eligibility-coverage).
 */
export const FV_TRANSPORT_TYPES = [
  'SAMMELGUT',
  'TEILLADUNG',
  'KOMPLETTLADUNG',
  'DIREKT',
  'DIREKT_UMSCHLAG',
  'BEILADER',
  'SONDER',
] as const;

@Injectable()
export class ToursService {
  private readonly logger = new Logger(ToursService.name);
  /** 60s-TTL Cache: aktive FV-Relations (= unsere FV). */
  private fvRelationsCache: { ids: Set<string>; ts: number } | null = null;
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly locks: LockService,
    private readonly statusSvc: StatusService,
  ) {}

  async findAll(filters: { status?: string; date?: Date }) {
    const where: any = {
      status: { notIn: ['cancelled'] },
    };

    if (filters.status?.includes(',')) {
      const parts = filters.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length) where.status = { in: parts };
    } else if (filters.status) {
      where.status = filters.status;
    }
    if (filters.date) {
      where.tour_date = filters.date;
    }

    const rows = await this.prisma.tours.findMany({
      where,
      include: {
        subcontractors: { select: { id: true, name: true } },
        sub_condition: {
          select: {
            id: true,
            condition_type: true,
            rate_flat: true,
            rate_per_ldm: true,
            rate_per_kg: true,
            rate_per_km: true,
          },
        },
        shipments: {
          where: { deleted_at: null },
          select: { id: true, ldm: true },
        },
      },
      orderBy: [{ tour_date: 'asc' }, { created_at: 'asc' }],
    });
    return this.locks.enrichToursWithReleaseBlockInfo(rows);
  }

  /** Abgeschlossene / erledigte Touren inkl. Sendungsdetails (für Archiv-Übersicht). */
  async findCompletedArchive() {
    return this.prisma.tours.findMany({
      where: {
        status: { in: ['closed', 'completed'] },
      },
      include: {
        subcontractors: { select: { id: true, name: true } },
        shipments: {
          where: { deleted_at: null },
          include: {
            customers: { select: { id: true, name: true } },
            business_partner: {
              select: { id: true, name: true, partner_number: true },
            },
            addresses_shipments_loading_address_idToaddresses: true,
            addresses_shipments_delivery_address_idToaddresses: true,
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
          orderBy: [{ tour_position: 'asc' }, { created_at: 'asc' }],
        },
      },
      orderBy: [{ closed_at: 'desc' }, { completed_at: 'desc' }, { tour_date: 'desc' }],
    });
  }

  async findOne(id: string) {
    const tour = await this.prisma.tours.findUnique({
      where: { id },
      include: {
        subcontractors: true,
        hub_start_address: true,
        hub_end_address: true,
        shipments: {
          where: { deleted_at: null },
          include: {
            customers: { select: { id: true, name: true } },
            addresses_shipments_loading_address_idToaddresses: true,
            addresses_shipments_delivery_address_idToaddresses: true,
            shipment_package_items: { select: { stackable: true } },
          },
          orderBy: [{ tour_position: 'asc' }, { created_at: 'asc' }],
        },
      },
    });

    if (!tour) {
      throw new NotFoundException(`Tour ${id} nicht gefunden`);
    }

    // B-4 + B-4.5: Overload on-the-fly. LDM via effective-pairing
    // aus shipments-include. Weight = naive Σ.
    const stackShips = tour.shipments.map((s) => ({
      ldm: Number(s.ldm ?? 0),
      height_cm: Number(s.height_cm ?? 0),
      weight_kg: Number(s.weight_kg ?? 0),
      stackable: isShipmentFullyStackable(s.shipment_package_items),
    }));
    const totalLdm = computeEffectiveLdm(stackShips);
    let totalKg = 0;
    for (const s of tour.shipments) totalKg += Number(s.weight_kg ?? 0);
    const overload = computeOverload(
      totalLdm,
      totalKg,
      tour.max_ldm != null ? Number(tour.max_ldm) : null,
      tour.max_weight_kg != null ? Number(tour.max_weight_kg) : null,
    );
    return { ...tour, overload };
  }

  async create(dto: CreateTourDto, userId?: string) {
    const createdBy =
      userId ??
      (await this.prisma.users.findFirst({ select: { id: true } }))?.id;
    if (!createdBy) throw new Error('No user found for tour created_by');

    return this.prisma.tours.create({
      data: {
        tour_date: new Date(dto.tourDate),
        tour_number: dto.tourNumber ?? `T${Date.now()}`,
        max_ldm: dto.maxLdm,
        status: 'planned',
        notes: dto.comment ?? null,
        created_by: createdBy,
        hub_start_address_id: dto.hubStartAddressId ?? null,
        hub_end_address_id: dto.hubEndAddressId ?? null,
        subcontractor_id: dto.subcontractorId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateTourDto) {
    await this.ensureExists(id);

    return this.prisma.tours.update({
      where: { id },
      data: {
        tour_date: dto.tourDate ? new Date(dto.tourDate) : undefined,
        subcontractor_id: dto.subcontractorId ?? undefined,
        subcontractor_cost: dto.plannedCost,
        status: dto.status as any,
        notes: dto.comment ?? undefined,
      },
    });
  }

  async getDbStatus(id: string) {
    const tour = await this.prisma.tours.findUnique({
      where: { id },
      select: {
        id: true,
        tour_number: true,
        total_revenue: true,
        subcontractor_cost: true,
        contribution_margin: true,
        cm_percent: true,
      },
    });

    if (!tour) {
      throw new NotFoundException(`Tour ${id} nicht gefunden`);
    }

    return {
      revenue: Number(tour.total_revenue ?? 0),
      cost: Number(tour.subcontractor_cost ?? 0),
      margin: Number(tour.contribution_margin ?? 0),
      percent: Number(tour.cm_percent ?? 0),
      traffic_light: null as string | null,
    };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.tours.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Tour ${id} nicht gefunden`);
    }
  }

  /**
   * B-4 + B-4.5: Aggregat aus shipments → Overload-Ratio (2 Achsen).
   * LDM via computeEffectiveLdm (cross-shipment Greedy-Pairing).
   * Weight bleibt naive Σ (Stapeln spart kein Gewicht).
   */
  private async computeTourOverload(tourId: string) {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      select: {
        max_ldm: true,
        max_weight_kg: true,
        shipments: {
          where: { deleted_at: null },
          select: {
            ldm: true,
            weight_kg: true,
            height_cm: true,
            shipment_package_items: { select: { stackable: true } },
          },
        },
      },
    });
    if (!tour) return null;
    const stackShips = tour.shipments.map((s) => ({
      ldm: Number(s.ldm ?? 0),
      height_cm: Number(s.height_cm ?? 0),
      weight_kg: Number(s.weight_kg ?? 0),
      stackable: isShipmentFullyStackable(s.shipment_package_items),
    }));
    const totalLdm = computeEffectiveLdm(stackShips);
    let totalKg = 0;
    for (const s of tour.shipments) totalKg += Number(s.weight_kg ?? 0);
    return computeOverload(
      totalLdm,
      totalKg,
      tour.max_ldm != null ? Number(tour.max_ldm) : null,
      tour.max_weight_kg != null ? Number(tour.max_weight_kg) : null,
    );
  }

  /** B-4: Pre-Check für dispatch/release. Throwt 409 bei Overload. */
  private async assertNotOverloaded(tourId: string) {
    const o = await this.computeTourOverload(tourId);
    if (o && o.isOverloaded) {
      throw new ConflictException({
        code: 'CAPACITY_EXCEEDED',
        message: formatOverloadMessage(o),
        overload: o,
      });
    }
  }

  async dispatchTour(id: string) {
    await this.ensureExists(id);
    await this.assertNotOverloaded(id);

    const now = new Date();

    await this.prisma.tours.update({
      where: { id },
      data: {
        status: 'dispatched',
        dispatched_at: now,
        cmr_generated_at: now,
      },
    });

    await this.prisma.shipments.updateMany({
      where: { tour_id: id, deleted_at: null },
      data: { status: 'dispatched' },
    });

    // Generate CMR (best-effort). Error should bubble up to caller.
    await this.documents.generateCmr(id);

    return this.findOne(id);
  }

  async completeTour(id: string) {
    await this.ensureExists(id);

    const now = new Date();

    await this.prisma.tours.update({
      where: { id },
      data: {
        status: 'completed',
        completed_at: now,
      },
    });

    return this.findOne(id);
  }

  async releaseTour(id: string) {
    await this.ensureExists(id);
    await this.assertNotOverloaded(id);

    const blocking = await this.locks.countReleaseBlockingLocksOnTour(id);
    if (blocking > 0) {
      throw new BadRequestException(
        `${blocking} Sendung(en) mit ADR-/ZOLL-Sperre – Sperren aufheben vor Freigabe`,
      );
    }

    const onTour = await this.prisma.shipments.findMany({
      where: { tour_id: id, deleted_at: null },
      select: { id: true },
    });

    const now = new Date();
    const driverAccessToken = `${randomUUID()}-${Date.now()}`;
    const driverPin = Math.floor(100000 + Math.random() * 900000).toString();
    const expires48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    await this.prisma.tours.update({
      where: { id },
      data: {
        status: 'released',
        released_at: now,
        driver_access_token: driverAccessToken,
        driver_token_expires_at: expires48h,
        driver_pin: driverPin,
        driver_pin_expires_at: expires48h,
      },
    });

    for (const s of onTour) {
      await this.statusSvc.addEvent(s.id, 'VERLADEN', { isAutomatic: true });
    }

    // Ensures the template renders correctly; frontend opens the PDF via dedicated download endpoint.
    await this.documents.generateLoadingList(id);

    return this.findOne(id);
  }

  async closeTour(id: string) {
    await this.ensureExists(id);

    const activeLocks = await this.locks.countActiveLocksOnTour(id);
    if (activeLocks > 0) {
      throw new BadRequestException(
        `${activeLocks} aktive Sperre(n) auf dieser Tour – zuerst aufheben`,
      );
    }

    const onTour = await this.prisma.shipments.findMany({
      where: { tour_id: id, deleted_at: null },
      select: { id: true },
    });

    const now = new Date();

    await this.prisma.tours.update({
      where: { id },
      data: {
        status: 'closed',
        closed_at: now,
        cmr_generated_at: now,
      },
    });

    // Generate CMR + set shipment statuses
    await this.documents.generateCmr(id);
    await this.prisma.shipments.updateMany({
      where: { tour_id: id, deleted_at: null },
      data: { status: 'in_transit' },
    });

    for (const s of onTour) {
      await this.statusSvc.addEvent(s.id, 'ABGEFERTIGT', { isAutomatic: true });
    }

    await this.documents.sendOutgoingBorderoPlaceholder(id);

    return this.findOne(id);
  }

  async addShipmentToTour(tourId: string, shipmentId: string) {
    await this.ensureExists(tourId);

    const [tour, shipment] = await Promise.all([
      this.prisma.tours.findUnique({
        where: { id: tourId },
        include: {
          subcontractors: true,
          shipments: {
            where: { deleted_at: null },
            select: { id: true, ldm: true, tour_position: true },
          },
        },
      }),
      this.prisma.shipments.findFirst({
        where: { id: shipmentId, deleted_at: null },
        select: {
          id: true,
          status: true,
          tour_id: true,
          ldm: true,
          is_hazmat: true,
          has_active_lock: true,
          lock_types: true,
        },
      }),
    ]);

    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);
    if (!shipment)
      throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    if (shipment.has_active_lock) {
      const lt = shipment.lock_types ?? 'Sperre';
      throw new BadRequestException(
        `Sendung gesperrt (${lt}) – Sperre aufheben bevor disponieren`,
      );
    }

    if (shipment.status !== 'new') {
      throw new BadRequestException(
        `Sendung ${shipmentId} hat Status '${shipment.status}' – erwartet: 'new'`,
      );
    }
    if (shipment.tour_id) {
      throw new BadRequestException(
        `Sendung ${shipmentId} ist bereits einer Tour zugeordnet`,
      );
    }

    const currentLdm = tour.shipments.reduce(
      (sum, s) => sum + (Number(s.ldm) || 0),
      0,
    );
    const newLdm = currentLdm + (Number(shipment.ldm) || 0);
    void newLdm; // B-4: Overload nicht mehr blockend, nur Hinweis in
    // findOne-Response. Pre-Check in dispatchTour/releaseTour.

    if (shipment.is_hazmat && !tour.subcontractors?.has_adr_license) {
      throw new BadRequestException(
        'Subunternehmer hat keine ADR-Zulassung für Gefahrgut-Sendungen',
      );
    }

    const maxPosition = tour.shipments.reduce(
      (max, s) => Math.max(max, Number(s.tour_position) || 0),
      0,
    );
    const nextPosition = maxPosition + 1;

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        tour_id: tourId,
        tour_position: nextPosition,
        status: 'dispatched',
      },
    });

    setImmediate(() => {
      void this.safeRecomputeFvSchedule(tourId);
    });

    return this.findOne(tourId);
  }

  async removeShipmentFromTour(tourId: string, shipmentId: string) {
    await this.ensureExists(tourId);

    const shipment = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null, tour_id: tourId },
      select: { id: true, status: true },
    });

    if (!shipment)
      throw new NotFoundException(
        `Sendung ${shipmentId} nicht auf Tour ${tourId} gefunden`,
      );

    // Before closing a tour, sendungen should be removable back to "new"
    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        status: 'new',
        tour_id: null,
        tour_position: null,
        planned_arrival_fv: null,
        planned_departure_fv: null,
        risk_score_fv: null,
        risk_severity_fv: null,
      },
    });

    setImmediate(() => {
      void this.safeRecomputeFvSchedule(tourId);
    });

    return this.findOne(tourId);
  }

  async updateShipmentOrder(tourId: string, shipmentIds: string[]) {
    await this.ensureExists(tourId);

    const uniqueShipmentIds = [...new Set(shipmentIds)];
    if (uniqueShipmentIds.length !== shipmentIds.length) {
      throw new BadRequestException('shipmentIds enthält Duplikate');
    }

    const shipments = await this.prisma.shipments.findMany({
      where: { id: { in: shipmentIds }, deleted_at: null, tour_id: tourId },
      select: { id: true },
    });

    if (shipments.length !== shipmentIds.length) {
      throw new BadRequestException(
        'Nicht alle Sendungen gehören zur Tour oder sind nicht aktiv',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (let idx = 0; idx < shipmentIds.length; idx++) {
        const id = shipmentIds[idx];
        await tx.shipments.update({
          where: { id },
          data: { tour_position: idx + 1 },
        });
      }
      // Transient: Polyline invalidieren — FE-Fallback rendert bis
      // safeRouteOnlyFv (Background) die echte Geometry persistiert.
      await tx.tours.update({
        where: { id: tourId },
        data: { polyline_geometry: Prisma.JsonNull },
      });
    });

    // AFTER commit: background-route für USER-Order (kein TSP).
    setImmediate(() => {
      void this.safeRouteOnlyFv(tourId);
    });
    setImmediate(() => {
      void this.safeRecomputeFvSchedule(tourId);
    });

    return this.findOne(tourId);
  }

  async getDocumentsForTour(id: string) {
    await this.ensureExists(id);

    const tour = await this.prisma.tours.findUnique({
      where: { id },
      select: {
        id: true,
        tour_number: true,
        tour_date: true,
        cmr_generated_at: true,
        status: true,
      },
    });

    if (!tour) throw new NotFoundException(`Tour ${id} nicht gefunden`);

    const shipments = await this.prisma.shipments.findMany({
      where: { tour_id: id, deleted_at: null },
      select: { id: true },
    });

    const shipmentIds = shipments.map((s) => s.id);

    const invoices =
      shipmentIds.length > 0
        ? await this.prisma.invoices.findMany({
            where: {
              invoice_items: {
                some: {
                  shipment_id: { in: shipmentIds },
                },
              },
            },
            select: {
              id: true,
              invoice_number: true,
              invoice_date: true,
              status: true,
              customers: { select: { name: true } },
            },
            orderBy: { invoice_date: 'desc' },
          })
        : [];

    const documents: Array<
      | { type: 'cmr'; generatedAt: Date | null }
      | {
          type: 'invoice';
          id: string;
          invoiceNumber: string;
          invoiceDate: Date;
          status: string;
          customerName: string;
        }
    > = [];

    documents.push({
      type: 'cmr',
      generatedAt: tour.cmr_generated_at,
    });

    documents.push(
      ...invoices.map((inv) => ({
        type: 'invoice' as const,
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        status: inv.status,
        customerName: inv.customers?.name ?? '–',
      })),
    );

    return documents;
  }

  // ════════════════════════════════════════════════════════════════════
  // FV-1: Disposition-Layer
  // ════════════════════════════════════════════════════════════════════

  /** 60s-TTL Cache: aktive FV-Relations als Set<id>. */
  private async getOwnFvRelationsSet(): Promise<Set<string>> {
    const now = Date.now();
    if (this.fvRelationsCache && now - this.fvRelationsCache.ts < 60_000) {
      return this.fvRelationsCache.ids;
    }
    const rels = await this.prisma.relations.findMany({
      where: { is_active: true },
      select: { id: true },
    });
    const ids = new Set(rels.map((r) => r.id));
    this.fvRelationsCache = { ids, ts: now };
    return ids;
  }


  /**
   * T-3.3 Best-Tour-Match.
   * Sucht Top-3 Touren (FV + NV) für eine Sendung via
   * Haversine-Geo + Capacity + Time + Cluster.
   */
  async findBestMatchForShipment(shipmentId: string) {
    if (!shipmentId) return [];
    const ship = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        ldm: true,
        weight_kg: true,
        loading_date: true,
        customer_id: true,
        addresses_shipments_loading_address_idToaddresses: {
          select: { lat: true, lng: true },
        },
      },
    });
    if (!ship) return [];
    const loading_lat =
      ship.addresses_shipments_loading_address_idToaddresses?.lat != null
        ? Number(ship.addresses_shipments_loading_address_idToaddresses.lat)
        : null;
    const loading_lng =
      ship.addresses_shipments_loading_address_idToaddresses?.lng != null
        ? Number(ship.addresses_shipments_loading_address_idToaddresses.lng)
        : null;

    // FV-Touren-Pool (planned/dispatched)
    const fvTours = await this.prisma.tours.findMany({
      where: { status: { in: ['planned', 'dispatched'] } },
      select: {
        id: true,
        tour_number: true,
        tour_date: true,
        status: true,
        max_ldm: true,
        max_weight_kg: true,
        total_ldm: true,
        total_weight_kg: true,
        shipments: {
          where: { deleted_at: null },
          orderBy: { tour_position: 'desc' },
          take: 1,
          select: {
            customer_id: true,
            addresses_shipments_loading_address_idToaddresses: {
              select: { lat: true, lng: true },
            },
          },
        },
      },
      take: 100,
    });

    // NV-Touren-Pool (PLANNING/IN_PROGRESS)
    const nvTours = await this.prisma.nv_touren.findMany({
      where: { status: { in: ['PLANNING', 'IN_PROGRESS'] } },
      select: {
        id: true,
        datum: true,
        status: true,
        subunternehmer: {
          select: { max_ldm: true, max_gewicht_kg: true },
        },
        stops: {
          orderBy: { position: 'desc' },
          take: 1,
          select: {
            shipment: {
              select: {
                customer_id: true,
                ldm: true,
                weight_kg: true,
                addresses_shipments_loading_address_idToaddresses: {
                  select: { lat: true, lng: true },
                },
              },
            },
          },
        },
      },
      take: 100,
    });

    const candidates: MatchTourCandidate[] = [
      ...fvTours.map((t) => {
        const last = t.shipments[0];
        return {
          id: t.id,
          mode: 'fv' as const,
          tour_number: t.tour_number,
          datum: t.tour_date,
          status: t.status,
          max_ldm: t.max_ldm ? Number(t.max_ldm) : null,
          max_weight_kg: t.max_weight_kg ? Number(t.max_weight_kg) : null,
          used_ldm: t.total_ldm ? Number(t.total_ldm) : 0,
          used_weight_kg: t.total_weight_kg ? Number(t.total_weight_kg) : 0,
          last_stop_lat:
            last?.addresses_shipments_loading_address_idToaddresses?.lat != null
              ? Number(
                  last.addresses_shipments_loading_address_idToaddresses.lat,
                )
              : null,
          last_stop_lng:
            last?.addresses_shipments_loading_address_idToaddresses?.lng != null
              ? Number(
                  last.addresses_shipments_loading_address_idToaddresses.lng,
                )
              : null,
          customer_ids: t.shipments
            .map((s) => s.customer_id)
            .filter((id): id is string => !!id),
        };
      }),
      ...nvTours.map((t) => {
        const last = t.stops[0]?.shipment;
        return {
          id: t.id,
          mode: 'nv' as const,
          tour_number: null,
          datum: t.datum,
          status: t.status,
          max_ldm: t.subunternehmer?.max_ldm
            ? Number(t.subunternehmer.max_ldm)
            : null,
          max_weight_kg: t.subunternehmer?.max_gewicht_kg
            ? Number(t.subunternehmer.max_gewicht_kg)
            : null,
          used_ldm: 0, // NV: nicht persistiert, würde aggregate kosten
          used_weight_kg: 0,
          last_stop_lat:
            last?.addresses_shipments_loading_address_idToaddresses?.lat != null
              ? Number(
                  last.addresses_shipments_loading_address_idToaddresses.lat,
                )
              : null,
          last_stop_lng:
            last?.addresses_shipments_loading_address_idToaddresses?.lng != null
              ? Number(
                  last.addresses_shipments_loading_address_idToaddresses.lng,
                )
              : null,
          customer_ids: last?.customer_id ? [last.customer_id] : [],
        };
      }),
    ];

    const shipmentInput = {
      id: ship.id,
      ldm: ship.ldm ? Number(ship.ldm) : null,
      weight_kg: ship.weight_kg ? Number(ship.weight_kg) : null,
      loading_date: ship.loading_date,
      customer_id: ship.customer_id,
      loading_lat,
      loading_lng,
    };
    // T-3.3.1: OSRM-Precise (Async). Bei route-fail Fallback
    // intern Haversine. Env-Flag MATCHER_PRECISE für quick-Disable.
    if (process.env.MATCHER_PRECISE !== 'false') {
      return findBestToursForShipmentPrecise(
        shipmentInput,
        candidates,
        routeDistanceKm,
        3,
      );
    }
    return findBestToursForShipment(shipmentInput, candidates, 3);
  }

  async eligibleShipmentsFv(filter: {
    datum?: string;
    search?: string;
    tourId?: string;
  }) {
    // P0-6.6: KEIN early-return mehr bei fvRelations.size === 0.
    // Branch 3 (Charter, outside-NV) braucht KEIN relation_id —
    // Charter wären sonst auch ohne Stammdaten-Relations unsichtbar.
    // Branch 1+2 nutzen fvRelations weiter (NV-Gebiet-Pfade brauchen
    // pre-defined FV-Route).
    const fvRelations = await this.getOwnFvRelationsSet();

    // NV-Gebiet-PLZ-Set (60s-Cache, geteilt mit nv-touren).
    // exact + prefixes — Application-Side-Match via Prisma
    // 'in' bzw. startsWith-OR.
    const nvPlz = await getNvPlzSet(this.prisma as any);
    const nvExactList = [...nvPlz.exact];
    const nvPrefixOr = nvPlz.prefixes.map((p) => ({
      zip: { startsWith: p },
    }));
    const inNvGebiet = {
      OR: [
        { zip: { in: nvExactList } },
        ...nvPrefixOr,
      ],
    };
    const outsideNvGebiet = {
      AND: [
        { zip: { notIn: nvExactList } },
        ...nvPlz.prefixes.map((p) => ({
          NOT: { zip: { startsWith: p } },
        })),
      ],
    };

    const eligibilityOr: any[] = [
      // 1. NV-Gebiet + durch eigene NV-Tour PICKUP-completed
      //    P0-6: stop_type='PICKUP' filtert DELIVERY-completed
      //    aus (DELIVERY = beim Empfänger = NICHT FV-eligible).
      {
        AND: [
          {
            addresses_shipments_loading_address_idToaddresses: inNvGebiet,
          },
          { relation_id: { in: [...fvRelations] } },
          {
            nv_tour_stops: {
              some: {
                stop_type: 'PICKUP',
                nv_tour: { status: 'COMPLETED' },
              },
            },
          },
        ],
      },
      // 2. NV-Gebiet + Partner-Vorlauf
      {
        AND: [
          {
            addresses_shipments_loading_address_idToaddresses: inNvGebiet,
          },
          { relation_id: { in: [...fvRelations] } },
          { partner_delivered: true },
        ],
      },
      // 3. Außerhalb NV-Gebiet = Charter (KEIN relation_id-Filter —
      //    Charter sind ad-hoc-Routen ohne pre-defined FV-Relation).
      {
        addresses_shipments_loading_address_idToaddresses: outsideNvGebiet,
      },
    ];

    const where: any = {
      // P0-6.5: status sowohl 'new' (Charter direkt) als auch
      // 'in_warehouse' (NV-PICKUP-completed liegt im Depot).
      // 'new'-only schloss alle vorgeholten Sendungen aus.
      status: { in: ['new', 'in_warehouse'] },
      tour_id: null,
      deleted_at: null,
      transport_type: { in: FV_TRANSPORT_TYPES },
      AND: [{ OR: eligibilityOr }],
    };
    // P0-6.6: KEIN loading_date-Filter mehr.
    // PICKUP-completed Sendungen haben loading_date PAST,
    // Charter haben loading_date FUTURE — keine einheitliche
    // Richtung. FE darf zukünftig optional Range-Filter
    // hinzufügen, BE liefert ALLE eligible Sendungen.
    void filter.datum;
    if (filter.search) {
      where.AND.push({
        OR: [
          { shipment_number: { contains: filter.search, mode: 'insensitive' } },
          {
            customers: {
              name: { contains: filter.search, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    const shipments = await this.prisma.shipments.findMany({
      where,
      orderBy: [{ loading_date: 'asc' }, { created_at: 'asc' }],
      include: {
        customers: {
          select: {
            id: true,
            customer_number: true,
            name: true,
            priority_tier: true,
          },
        },
        relation: {
          select: {
            id: true,
            code: true,
            name: true,
            direction: true,
            country_from: true,
            country_to: true,
            zip_prefix_from: true,
            zip_prefix_to: true,
          },
        },
        addresses_shipments_loading_address_idToaddresses: {
          select: {
            id: true,
            name: true,
            street: true,
            zip: true,
            city: true,
            country_code: true,
            lat: true,
            lng: true,
          },
        },
        addresses_shipments_delivery_address_idToaddresses: {
          select: {
            id: true,
            name: true,
            street: true,
            zip: true,
            city: true,
            country_code: true,
            lat: true,
            lng: true,
          },
        },
      },
      take: 500,
    });

    return shipments.map((s) => {
      const loading_address =
        s.addresses_shipments_loading_address_idToaddresses;
      const delivery_address =
        s.addresses_shipments_delivery_address_idToaddresses;
      const {
        addresses_shipments_loading_address_idToaddresses: _a,
        addresses_shipments_delivery_address_idToaddresses: _b,
        customers,
        ...rest
      } = s;
      return {
        ...rest,
        customer: customers,
        loading_address,
        delivery_address,
        pin_address: loading_address,
        is_in_fv_relation: true,
      };
    });
  }

  async batchStopsFv(
    tourId: string,
    input: { adds: string[]; removes: string[] },
  ) {
    const adds = Array.from(new Set(input.adds ?? [])).filter(Boolean);
    const removes = Array.from(new Set(input.removes ?? [])).filter(Boolean);
    if (adds.length === 0 && removes.length === 0) {
      return { ok: true, added: 0, removed: 0 };
    }

    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        subcontractors: {
          select: { id: true, has_adr_license: true },
        },
        shipments: {
          where: { deleted_at: null },
          select: {
            id: true,
            ldm: true,
            weight_kg: true,
            tour_position: true,
            is_hazmat: true,
          },
        },
      },
    });
    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);

    const currentIds = new Set(tour.shipments.map((s) => s.id));
    for (const r of removes) {
      if (!currentIds.has(r)) {
        throw new NotFoundException(`Sendung ${r} nicht auf Tour ${tourId}`);
      }
    }

    const addsShipments =
      adds.length > 0
        ? await this.prisma.shipments.findMany({
            where: { id: { in: adds }, deleted_at: null },
            select: {
              id: true,
              status: true,
              tour_id: true,
              ldm: true,
              weight_kg: true,
              is_hazmat: true,
              has_active_lock: true,
              lock_types: true,
            },
          })
        : [];
    const foundAddIds = new Set(addsShipments.map((s) => s.id));
    for (const a of adds) {
      if (!foundAddIds.has(a)) {
        throw new NotFoundException(`Sendung ${a} nicht gefunden`);
      }
    }
    for (const s of addsShipments) {
      if (s.has_active_lock) {
        throw new BadRequestException(
          `Sendung ${s.id} gesperrt (${s.lock_types ?? 'Sperre'}) — disponieren nicht möglich`,
        );
      }
      if (s.status !== 'new') {
        throw new BadRequestException(
          `Sendung ${s.id} hat Status '${s.status}' (erwartet: 'new')`,
        );
      }
      if (s.tour_id) {
        throw new BadRequestException(
          `Sendung ${s.id} ist bereits einer Tour zugeordnet`,
        );
      }
    }

    // Hazmat-Check kumulativ
    const willBeHazmat =
      tour.shipments.some(
        (s) => !removes.includes(s.id) && s.is_hazmat === true,
      ) || addsShipments.some((s) => s.is_hazmat === true);
    if (willBeHazmat && !tour.subcontractors?.has_adr_license) {
      throw new BadRequestException(
        'Subunternehmer hat keine ADR-Zulassung für Gefahrgut-Sendungen',
      );
    }

    // Cumulative Capacity
    const removedSet = new Set(removes);
    let curLdm = 0;
    let curKg = 0;
    for (const s of tour.shipments) {
      if (removedSet.has(s.id)) continue;
      curLdm += Number(s.ldm ?? 0);
      curKg += Number(s.weight_kg ?? 0);
    }
    for (const s of addsShipments) {
      curLdm += Number(s.ldm ?? 0);
      curKg += Number(s.weight_kg ?? 0);
    }
    // B-4: Overload NICHT blockend. Capacity-Ratio wird in
    // findOne-Response zurückgegeben. dispatchTour/releaseTour
    // prüft Overload und throwt bei isOverloaded.
    const overload = computeOverload(
      curLdm,
      curKg,
      tour.max_ldm != null ? Number(tour.max_ldm) : null,
      tour.max_weight_kg != null ? Number(tour.max_weight_kg) : null,
    );
    if (overload.isOverloaded) {
      this.logger.warn(
        `batchStopsFv(${tourId}): ${formatOverloadMessage(overload)}`,
      );
    }

    const maxPos = tour.shipments.reduce(
      (m, s) => Math.max(m, Number(s.tour_position) || 0),
      0,
    );
    let nextPos = maxPos + 1;

    await this.prisma.$transaction(async (tx) => {
      if (removes.length > 0) {
        await tx.shipments.updateMany({
          where: { id: { in: removes } },
          data: {
            tour_id: null,
            tour_position: null,
            status: 'new',
          },
        });
      }
      for (const shipmentId of adds) {
        await tx.shipments.update({
          where: { id: shipmentId },
          data: {
            tour_id: tourId,
            tour_position: nextPos,
            status: 'dispatched',
          },
        });
        nextPos += 1;
      }
    });

    setImmediate(() => {
      void this.safeOptimizeFvTour(tourId);
    });
    setImmediate(() => {
      void this.safeRecomputeFvSchedule(tourId);
    });

    return { ok: true, added: adds.length, removed: removes.length };
  }

  private async safeOptimizeFvTour(tourId: string) {
    try {
      await this.optimizeFvTour(tourId);
    } catch (err: any) {
      this.logger.warn(
        `optimizeFvTour(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  /** Wraps routeOnlyForFvTour. Background-Pfad nach manual reorder. */
  private async safeRouteOnlyFv(tourId: string) {
    try {
      await this.routeOnlyForFvTour(tourId);
    } catch (err: any) {
      this.logger.warn(
        `routeOnlyForFvTour(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  /** W-2.1: recompute planned_arrival_fv/departure + risk pro Stop. */
  private async safeRecomputeFvSchedule(tourId: string) {
    try {
      await this.recomputeFvSchedule(tourId);
    } catch (err: any) {
      this.logger.warn(
        `recomputeFvSchedule(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  async recomputeFvSchedule(tourId: string) {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      select: {
        id: true,
        tour_date: true,
        departure_time: true,
        hub_start_address: { select: { lat: true, lng: true } },
        shipments: {
          where: { deleted_at: null },
          orderBy: [{ tour_position: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true,
            tour_position: true,
            loading_time_from: true,
            loading_time_to: true,
            delivery_time_from: true,
            delivery_time_to: true,
            addresses_shipments_delivery_address_idToaddresses: {
              select: { lat: true, lng: true },
            },
          },
        },
      },
    });
    if (!tour || tour.shipments.length === 0) return null;

    const startCoord =
      tour.hub_start_address?.lat != null && tour.hub_start_address?.lng != null
        ? {
            lat: Number(tour.hub_start_address.lat),
            lng: Number(tour.hub_start_address.lng),
          }
        : null;

    const sched = computeFvSchedule({
      tourDate: tour.tour_date,
      departureTime: tour.departure_time,
      startCoord,
      shipments: tour.shipments.map((s) => ({
        id: s.id,
        tour_position: s.tour_position,
        loading_time_from: s.loading_time_from,
        loading_time_to: s.loading_time_to,
        delivery_time_from: s.delivery_time_from,
        delivery_time_to: s.delivery_time_to,
        delivery_address: s.addresses_shipments_delivery_address_idToaddresses
          ? {
              lat:
                s.addresses_shipments_delivery_address_idToaddresses.lat != null
                  ? Number(
                      s.addresses_shipments_delivery_address_idToaddresses.lat,
                    )
                  : null,
              lng:
                s.addresses_shipments_delivery_address_idToaddresses.lng != null
                  ? Number(
                      s.addresses_shipments_delivery_address_idToaddresses.lng,
                    )
                  : null,
            }
          : null,
      })),
    });
    await this.prisma.$transaction(
      sched.map((s) =>
        this.prisma.shipments.update({
          where: { id: s.shipment_id },
          data: {
            planned_arrival_fv: s.planned_arrival,
            planned_departure_fv: s.planned_departure,
            risk_score_fv: s.risk_score,
            risk_severity_fv: s.risk_severity,
          },
        }),
      ),
    );
    return sched.length;
  }

  /**
   * FV: Polyline für USER-Order (kein TSP-Reorder).
   * Coord-Sequenz: hub_start → shipments(in tour_position) → hub_end
   * Falls Hub-Adressen fehlen: nur shipments-coords.
   * Persistiert polyline_geometry + geplante_km.
   */
  async routeOnlyForFvTour(tourId: string) {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        hub_start_address: { select: { lat: true, lng: true } },
        hub_end_address: { select: { lat: true, lng: true } },
        shipments: {
          where: { deleted_at: null },
          orderBy: [{ tour_position: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true,
            addresses_shipments_loading_address_idToaddresses: {
              select: { lat: true, lng: true },
            },
          },
        },
      },
    });
    if (!tour) {
      this.logger.warn(`routeOnlyForFvTour(${tourId}): tour nicht gefunden`);
      return null;
    }

    const stopCoords: Array<[number, number]> = [];
    for (const s of tour.shipments) {
      const addr = s.addresses_shipments_loading_address_idToaddresses;
      if (!addr || addr.lat == null || addr.lng == null) continue;
      const lat = Number(addr.lat);
      const lng = Number(addr.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stopCoords.push([lng, lat]);
    }
    if (stopCoords.length === 0) {
      this.logger.warn(
        `routeOnlyForFvTour(${tourId}): no shipment coords — skip`,
      );
      return null;
    }

    const hubStart = tour.hub_start_address;
    const hubEnd = tour.hub_end_address;
    const hasHub =
      hubStart?.lat != null &&
      hubStart?.lng != null &&
      hubEnd?.lat != null &&
      hubEnd?.lng != null;

    const coords: Array<[number, number]> = hasHub
      ? [
          [Number(hubStart!.lng), Number(hubStart!.lat)],
          ...stopCoords,
          [Number(hubEnd!.lng), Number(hubEnd!.lat)],
        ]
      : stopCoords;
    if (coords.length < 2) {
      this.logger.warn(
        `routeOnlyForFvTour(${tourId}): <2 coords — skip`,
      );
      return null;
    }

    const result = await routeOnly(coords);
    if (!result) {
      this.logger.warn(
        `routeOnlyForFvTour(${tourId}): OSRM null — polyline bleibt JsonNull`,
      );
      return null;
    }
    await this.prisma.tours.update({
      where: { id: tourId },
      data: {
        geplante_km: result.distanceKm.toFixed(2),
        km_calculated_at: new Date(),
        polyline_geometry: result.geometry
          ? (result.geometry as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    return result.distanceKm;
  }

  /**
   * Optimize FV-Tour:
   * - Wenn hub_start_address + hub_end_address mit lat/lng vorhanden:
   *     OSRM-Trip mit Hub-Pinning, Reorder + KM-Update
   * - Sonst: nur recalc KM (Distance aus shipment-loading-Adressen)
   */
  async optimizeFvTour(tourId: string) {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        hub_start_address: {
          select: { id: true, lat: true, lng: true },
        },
        hub_end_address: {
          select: { id: true, lat: true, lng: true },
        },
        shipments: {
          where: { deleted_at: null },
          orderBy: [{ tour_position: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true,
            tour_position: true,
            addresses_shipments_loading_address_idToaddresses: {
              select: { lat: true, lng: true },
            },
          },
        },
      },
    });
    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);

    const stopsWithCoords: Array<{ id: string; coord: [number, number] }> = [];
    for (const s of tour.shipments) {
      const addr = s.addresses_shipments_loading_address_idToaddresses;
      if (!addr || addr.lat == null || addr.lng == null) continue;
      const lat = Number(addr.lat);
      const lng = Number(addr.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stopsWithCoords.push({ id: s.id, coord: [lng, lat] });
    }
    if (stopsWithCoords.length === 0) {
      this.logger.warn(
        `optimizeFvTour(${tourId}): no shipment-coords — skip`,
      );
      return null;
    }

    const hubStart = tour.hub_start_address;
    const hubEnd = tour.hub_end_address;
    const hasHub =
      hubStart?.lat != null &&
      hubStart?.lng != null &&
      hubEnd?.lat != null &&
      hubEnd?.lng != null;

    if (!hasHub || stopsWithCoords.length === 1) {
      // Fallback: Distance aus shipment-coords ohne Reorder
      const coords: Array<[number, number]> = stopsWithCoords.map(
        (s) => s.coord,
      );
      if (coords.length < 2) {
        await this.prisma.tours.update({
          where: { id: tourId },
          data: { km_calculated_at: new Date() },
        });
        return null;
      }
      const km = await routeDistanceKm(coords);
      if (km == null) return null;
      await this.prisma.tours.update({
        where: { id: tourId },
        data: {
          geplante_km: km.toFixed(2),
          km_calculated_at: new Date(),
        },
      });
      return km;
    }

    // Hub-Pinning + Trip-Optimize
    const whStartCoord: [number, number] = [
      Number(hubStart!.lng),
      Number(hubStart!.lat),
    ];
    const whEndCoord: [number, number] = [
      Number(hubEnd!.lng),
      Number(hubEnd!.lat),
    ];
    const coords: Array<[number, number]> = [
      whStartCoord,
      ...stopsWithCoords.map((s) => s.coord),
      whEndCoord,
    ];
    const result = await routeTrip(coords);
    if (!result) {
      this.logger.warn(`optimizeFvTour(${tourId}): trip null — fallback km`);
      const km = await routeDistanceKm(coords);
      if (km != null) {
        await this.prisma.tours.update({
          where: { id: tourId },
          data: {
            geplante_km: km.toFixed(2),
            km_calculated_at: new Date(),
          },
        });
      }
      return null;
    }

    const lastIdx = coords.length - 1;
    const newOrderStopIds: string[] = [];
    for (const inputIdx of result.optimizedOrder) {
      if (inputIdx === 0 || inputIdx === lastIdx) continue;
      const stopIdx = inputIdx - 1;
      if (stopIdx >= 0 && stopIdx < stopsWithCoords.length) {
        newOrderStopIds.push(stopsWithCoords[stopIdx].id);
      }
    }
    if (newOrderStopIds.length !== stopsWithCoords.length) {
      this.logger.warn(
        `optimizeFvTour(${tourId}): order mismatch — fallback km only`,
      );
      await this.prisma.tours.update({
        where: { id: tourId },
        data: {
          geplante_km: result.distanceKm.toFixed(2),
          km_calculated_at: new Date(),
        },
      });
      return result.distanceKm;
    }

    await this.prisma.$transaction([
      ...newOrderStopIds.map((shipmentId, i) =>
        this.prisma.shipments.update({
          where: { id: shipmentId },
          data: { tour_position: i + 1 },
        }),
      ),
      this.prisma.tours.update({
        where: { id: tourId },
        data: {
          geplante_km: result.distanceKm.toFixed(2),
          km_calculated_at: new Date(),
          polyline_geometry: result.geometry
            ? (result.geometry as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      }),
    ]);
    return result.distanceKm;
  }
}
