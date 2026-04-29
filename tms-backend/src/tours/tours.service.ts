import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTourDto } from './dto/create-tour.dto';
import { UpdateTourDto } from './dto/update-tour.dto';
import { DocumentsService } from '../documents/documents.service';
import { LockService } from '../status/lock.service';
import { StatusService } from '../status/status.service';

@Injectable()
export class ToursService {
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
}
