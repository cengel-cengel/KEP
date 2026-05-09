import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { UpdateTourDto } from './dto/update-tour.dto';
import { DocumentsService } from '../documents/documents.service';
import { LockService } from '../status/lock.service';
import { StatusService } from '../status/status.service';
import { routeDistanceKm, routeTrip } from '../lib/osrm.lib';

const FV_TRANSPORT_TYPES = [
  'SAMMELGUT',
  'TEILLADUNG',
  'KOMPLETTLADUNG',
  'DIREKT',
  'DIREKT_UMSCHLAG',
  'BEILADER',
  'SONDER',
];

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
        shipments: {
          where: { deleted_at: null },
          include: {
            customers: { select: { id: true, name: true } },
            addresses_shipments_loading_address_idToaddresses: true,
            addresses_shipments_delivery_address_idToaddresses: true,
          },
        },
      },
    });

    if (!tour) {
      throw new NotFoundException(`Tour ${id} nicht gefunden`);
    }

    return tour;
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

  async dispatchTour(id: string) {
    await this.ensureExists(id);

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

    if (tour.max_ldm != null && newLdm > Number(tour.max_ldm)) {
      throw new BadRequestException(
        `Tour überladen: ${newLdm.toFixed(2)} ldm > Max ${tour.max_ldm} ldm`,
      );
    }

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
      },
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

  async eligibleShipmentsFv(filter: {
    datum?: string;
    search?: string;
    tourId?: string;
  }) {
    const fvRelations = await this.getOwnFvRelationsSet();
    if (fvRelations.size === 0) return [];

    const where: any = {
      status: 'new',
      tour_id: null,
      deleted_at: null,
      transport_type: { in: FV_TRANSPORT_TYPES },
      relation_id: { in: [...fvRelations] },
    };
    if (filter.datum) {
      where.loading_date = { lte: new Date(filter.datum) };
    }
    if (filter.search) {
      where.OR = [
        { shipment_number: { contains: filter.search, mode: 'insensitive' } },
        {
          customers: {
            name: { contains: filter.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const shipments = await this.prisma.shipments.findMany({
      where,
      orderBy: [{ loading_date: 'asc' }, { created_at: 'asc' }],
      include: {
        customers: { select: { id: true, customer_number: true, name: true } },
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
    const exceeded: { axis: string; total: number; max: number }[] = [];
    if (tour.max_ldm != null && curLdm > Number(tour.max_ldm)) {
      exceeded.push({
        axis: 'ldm',
        total: curLdm,
        max: Number(tour.max_ldm),
      });
    }
    if (tour.max_weight_kg != null && curKg > Number(tour.max_weight_kg)) {
      exceeded.push({
        axis: 'weight_kg',
        total: curKg,
        max: Number(tour.max_weight_kg),
      });
    }
    if (exceeded.length > 0) {
      throw new ConflictException({
        code: 'CAPACITY_EXCEEDED',
        would_exceed: exceeded,
      });
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
        },
      }),
    ]);
    return result.distanceKm;
  }
}
