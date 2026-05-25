import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
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
import { NvTourenService } from '../nv-touren/nv-touren.service';
import { StatusService } from '../status/status.service';
import {
  routeDistanceKm,
  routeOnly,
  routeTrip,
  routeWithDurations,
} from '../lib/osrm.lib';
import { getNvPlzSet } from '../lib/nv-plz.lib';
import {
  computeOverload,
  deriveMaxVolM3,
  formatOverloadMessage,
} from '../lib/capacity.lib';
import {
  computeEffectiveLdm,
  isShipmentFullyStackable,
} from '../lib/stackable.lib';
import {
  findBestToursForShipment,
  findBestToursForShipmentPrecise,
  type MatchTourCandidate,
} from '../lib/tourMatcher.lib';
import { buildTourRoute } from '../lib/routeGeometry.lib';
import { deriveIsCharter } from '../lib/tourCharterDerive.lib';
import { computeFvSchedule } from './fv-scheduler.lib';
import { CostsService } from '../costs/costs.service';
import { WarehousesService } from '../warehouses/warehouses.service';

/**
 * R2.1: nächster Werktag (Mo-Fr) ab `from`. Skip Sa/So.
 * Genutzt als delivery_date-Fallback bei Auto-FV-Tour-Create.
 */
function nextBusinessDay(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

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
    // R2.1: forwardRef da NvTouren → Tours zurück-importiert
    // (consolidateOrCreateFvTour-Hook bei completeStopShipment).
    @Inject(forwardRef(() => NvTourenService))
    private readonly nvTouren: NvTourenService,
    // R2.2: CostsService für recordHauptlaufCost (calculateMain
    // CarriageCost best-effort, dann shipment_cost_components-
    // Mirror mit phase='HAUPTLAUF').
    private readonly costs: CostsService,
    // R3-B: WarehousesService für ensureUmschlagAddressId →
    // tour.hub_start_address_id beim Charter-Umschlag-Auto-Create.
    private readonly warehouses: WarehousesService,
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
          select: {
            id: true,
            ldm: true,
            weight_kg: true,
            volume_m3: true,
            height_cm: true,
            shipment_package_items: { select: { stackable: true } },
          },
        },
      },
      orderBy: [{ tour_date: 'asc' }, { created_at: 'asc' }],
    });

    // R3-C: Auto-Konsolidiert-Marker. Lade HAUPTLAUF-cost_components
    // mit faktoren.source='auto_consolidate' für alle shipment_ids
    // dieser Tours. Tour mit ≥1 solchem Marker wird als
    // auto_consolidated=true geflaggt (UI-Badge + Filter).
    const shipmentIds: string[] = [];
    for (const t of rows) {
      for (const s of t.shipments ?? []) shipmentIds.push(s.id);
    }
    const autoTourIds = new Set<string>();
    if (shipmentIds.length > 0) {
      const components = await this.prisma.shipment_cost_components.findMany({
        where: {
          phase: 'HAUPTLAUF',
          shipment_id: { in: shipmentIds },
          faktoren: { path: ['source'], equals: 'auto_consolidate' } as any,
        },
        select: { faktoren: true },
      });
      for (const c of components) {
        const f = c.faktoren as { tour_id?: string } | null;
        if (f?.tour_id) autoTourIds.add(f.tour_id);
      }
    }
    const enriched = rows.map((t) => {
      // Phase 2.1: overload on-the-fly (analog NV-augmented-loop).
      // FV-Manual-Picker im Swap-Modal liest tour.overload fuer
      // capacityHint pro Option.
      const stackShips = (t.shipments as any[]).map((s) => ({
        ldm: Number(s.ldm ?? 0),
        height_cm: Number(s.height_cm ?? 0),
        weight_kg: Number(s.weight_kg ?? 0),
        stackable: isShipmentFullyStackable(s.shipment_package_items ?? []),
      }));
      const totalLdm = computeEffectiveLdm(stackShips);
      let totalKg = 0;
      let totalVolM3 = 0;
      for (const s of t.shipments as any[]) {
        totalKg += Number(s.weight_kg ?? 0);
        totalVolM3 += Number(s.volume_m3 ?? 0);
      }
      const maxLdm = t.max_ldm != null ? Number(t.max_ldm) : null;
      const overload = computeOverload(
        totalLdm,
        totalKg,
        maxLdm,
        t.max_weight_kg != null ? Number(t.max_weight_kg) : null,
        totalVolM3,
        deriveMaxVolM3(maxLdm),
      );
      return {
        ...t,
        auto_consolidated: autoTourIds.has(t.id),
        overload,
      };
    });
    return this.locks.enrichToursWithReleaseBlockInfo(enriched as any);
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
    // aus shipments-include. Weight = naive Σ. O-3: + Vol-Achse.
    const stackShips = tour.shipments.map((s) => ({
      ldm: Number(s.ldm ?? 0),
      height_cm: Number(s.height_cm ?? 0),
      weight_kg: Number(s.weight_kg ?? 0),
      stackable: isShipmentFullyStackable(s.shipment_package_items),
    }));
    const totalLdm = computeEffectiveLdm(stackShips);
    let totalKg = 0;
    let totalVolM3 = 0;
    for (const s of tour.shipments) {
      totalKg += Number(s.weight_kg ?? 0);
      totalVolM3 += Number(s.volume_m3 ?? 0);
    }
    const maxLdm = tour.max_ldm != null ? Number(tour.max_ldm) : null;
    const overload = computeOverload(
      totalLdm,
      totalKg,
      maxLdm,
      tour.max_weight_kg != null ? Number(tour.max_weight_kg) : null,
      totalVolM3,
      deriveMaxVolM3(maxLdm),
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
            volume_m3: true,
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
    let totalVolM3 = 0;
    for (const s of tour.shipments) {
      totalKg += Number(s.weight_kg ?? 0);
      totalVolM3 += Number(s.volume_m3 ?? 0);
    }
    const maxLdm = tour.max_ldm != null ? Number(tour.max_ldm) : null;
    return computeOverload(
      totalLdm,
      totalKg,
      maxLdm,
      tour.max_weight_kg != null ? Number(tour.max_weight_kg) : null,
      totalVolM3,
      deriveMaxVolM3(maxLdm),
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
      void this.safeRecomputeIsCharterFv(tourId).then(() => {
        void this.safeRecomputeFvSchedule(tourId);
      });
    });

    return this.findOne(tourId);
  }

  /**
   * R2.1: Charter-Umschlag-2-Touren-Flow — Auto-Konsolidierung
   * nach NV-Vorholung-Completed.
   *
   * Findet beste passende offene FV-Tour via tourMatcher und
   * fügt die Sendung dort hinzu. Wenn kein guter Match: legt
   * neue FV-Tour mit Smart-Defaults an und fügt Sendung hinzu.
   *
   * Idempotent: skipped wenn tour_id bereits gesetzt, lock,
   * falscher status, falsche classification.
   *
   * Status-Verhalten: bei consolidate/create wird shipment.status
   * NICHT geändert — bleibt 'in_warehouse' bis FV-Tour dispatcht
   * (dann setzt dispatchTour alle Sendungen auf 'dispatched').
   */
  async consolidateOrCreateFvTour(shipmentId: string): Promise<{
    action: 'consolidated' | 'created' | 'skipped';
    tourId?: string;
    reason?: string;
  }> {
    const shipment = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: {
        id: true,
        status: true,
        tour_id: true,
        classification: true,
        has_active_lock: true,
        lock_types: true,
        delivery_date: true,
        loading_date: true,
        ldm: true,
        weight_kg: true,
        is_hazmat: true,
      },
    });
    if (!shipment) return { action: 'skipped', reason: 'not_found' };
    if (shipment.tour_id)
      return { action: 'skipped', reason: 'already_assigned' };
    if (shipment.status !== 'in_warehouse')
      return { action: 'skipped', reason: 'wrong_status' };
    if (shipment.classification !== 'CHARTER_UMSCHLAG')
      return { action: 'skipped', reason: 'not_charter_umschlag' };
    if (shipment.has_active_lock)
      return { action: 'skipped', reason: 'shipment_locked' };

    // tourMatcher findet beste FV-Tour aus planned/dispatched-Pool.
    // findBestMatchForShipment liefert NV+FV; wir filtern FV-only.
    const matches = await this.findBestMatchForShipment(shipmentId);
    const fvMatches = matches.filter((m) => m.mode === 'fv');

    // Versuche Konsolidierung: bester FV-Match wenn capacity > 0.
    // capacityScore=0 schon im Matcher rausgefiltert; Test auf
    // tour_id-Race (Sendung bereits anderweitig zugewiesen).
    for (const m of fvMatches) {
      const linked = await this.tryLinkToFvTour(m.tour_id, shipmentId);
      if (linked.ok) {
        return { action: 'consolidated', tourId: m.tour_id };
      }
      // Wenn Match wegen Hazmat-ADR-Blocker oder Race scheitert
      // → nächsten Match versuchen.
    }

    // Kein Match → neue FV-Tour mit Smart-Defaults anlegen.
    const tourDate = shipment.delivery_date ?? nextBusinessDay(new Date());
    // R3-B: hub_start auf Umschlag-WH automatisch setzen (FV startet
    // ab Umschlag-Lager — "Umschlag immer eigenes Lager"). Wenn kein
    // is_umschlag-WH konfiguriert oder unvollständige Adresse:
    // null lassen (Mensch füllt manuell, scheduler fällt auf
    // default-WH zurück).
    const hubStartAddressId =
      await this.warehouses.ensureUmschlagAddressId();
    const created = await this.prisma.tours.create({
      data: {
        tour_date: tourDate,
        tour_number: `T${Date.now()}`,
        status: 'planned',
        max_ldm: 13.6, // Default-Trailer; Mensch kann später ändern.
        max_weight_kg: 24000,
        // subcontractor_id null lassen — Mensch weist zu vor Dispatch.
        hub_start_address_id: hubStartAddressId,
        // hub_end null lassen — Mensch füllt im UI (Destination-Region).
        created_by:
          (await this.prisma.users.findFirst({ select: { id: true } }))?.id ??
          '',
        notes: 'Auto-erstellt (CHARTER_UMSCHLAG-Konsolidierung).',
      },
    });
    const linked = await this.tryLinkToFvTour(created.id, shipmentId);
    if (linked.ok) {
      return { action: 'created', tourId: created.id };
    }
    // Sehr edge: Race oder Hazmat-Konflikt mit leerer Tour — sollte
    // nicht passieren (leere Tour hat kein hazmat-Konflikt). Skip.
    return { action: 'skipped', reason: linked.reason ?? 'link_failed' };
  }

  /**
   * R2.4: Dry-Run-Preview von consolidateOrCreateFvTour.
   * Returns geplante Action ohne irgendwelche Mutationen — Mensch
   * sieht vorab welche FV-Tour gematcht würde / welche neue Tour
   * angelegt würde.
   *
   * Format: gleiche shape wie consolidateOrCreateFvTour + zusätzlich
   * `candidates` Top-N tour-matches mit Score (nur FV+planned).
   */
  async dryRunConsolidate(shipmentId: string): Promise<{
    action: 'consolidated' | 'created' | 'skipped';
    tourId?: string;
    reason?: string;
    candidates?: Array<{
      tour_id: string;
      tour_number?: string | null;
      score: number;
      eligible: boolean;
      blocker?: string;
    }>;
  }> {
    const shipment = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: {
        id: true,
        status: true,
        tour_id: true,
        classification: true,
        has_active_lock: true,
        delivery_date: true,
      },
    });
    if (!shipment) return { action: 'skipped', reason: 'not_found' };
    if (shipment.tour_id)
      return { action: 'skipped', reason: 'already_assigned' };
    if (shipment.status !== 'in_warehouse')
      return { action: 'skipped', reason: 'wrong_status' };
    if (shipment.classification !== 'CHARTER_UMSCHLAG')
      return { action: 'skipped', reason: 'not_charter_umschlag' };
    if (shipment.has_active_lock)
      return { action: 'skipped', reason: 'shipment_locked' };

    const allMatches = await this.findBestMatchForShipment(shipmentId);
    const fvMatches = allMatches.filter((m) => m.mode === 'fv');

    // Eligibility-Vorprüfung pro Match-Tour (planned-Filter + hazmat-
    // Pre-Check). Read-only, kein update.
    const candidates: Array<{
      tour_id: string;
      tour_number?: string | null;
      score: number;
      eligible: boolean;
      blocker?: string;
    }> = [];
    for (const m of fvMatches) {
      const tour = await this.prisma.tours.findUnique({
        where: { id: m.tour_id },
        select: { id: true, status: true, tour_number: true },
      });
      let eligible = true;
      let blocker: string | undefined;
      if (!tour) {
        eligible = false;
        blocker = 'tour_not_found';
      } else if (tour.status !== 'planned') {
        eligible = false;
        blocker = `status_${tour.status}`;
      }
      candidates.push({
        tour_id: m.tour_id,
        tour_number: tour?.tour_number ?? m.tour_number,
        score: m.score,
        eligible,
        blocker,
      });
    }

    const firstEligible = candidates.find((c) => c.eligible);
    if (firstEligible) {
      return {
        action: 'consolidated',
        tourId: firstEligible.tour_id,
        candidates,
      };
    }
    return {
      action: 'created',
      reason: 'no_eligible_match',
      candidates,
    };
  }

  /**
   * R2.4: Admin-Bulk-Trigger für CHARTER_UMSCHLAG-Backfill.
   * Findet alle Sendungen mit status='in_warehouse', classification=
   * 'CHARTER_UMSCHLAG', tour_id=null und ruft consolidateOrCreateFvTour
   * für jede sequenziell. Async per setImmediate; Response sofort
   * mit count zurück.
   */
  async consolidateAllInWarehouse(opts: {
    limit?: number;
  } = {}): Promise<{
    pending: number;
    processed: 'background';
  }> {
    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
    const candidates = await this.prisma.shipments.findMany({
      where: {
        status: 'in_warehouse',
        classification: 'CHARTER_UMSCHLAG',
        tour_id: null,
        deleted_at: null,
      },
      select: { id: true },
      take: limit,
    });
    setImmediate(async () => {
      for (const c of candidates) {
        try {
          const res = await this.consolidateOrCreateFvTour(c.id);
          if (res.action !== 'skipped') {
            this.logger.log(
              `bulk-consolidate(${c.id}) → ${res.action} tour=${res.tourId ?? '—'}`,
            );
          }
        } catch (err: any) {
          this.logger.warn(
            `bulk-consolidate(${c.id}) threw: ${err?.message ?? err}`,
          );
        }
      }
      this.logger.log(`bulk-consolidate DONE (${candidates.length})`);
    });
    return { pending: candidates.length, processed: 'background' };
  }

  /**
   * R2.1: Internal helper — verlinkt Sendung mit FV-Tour ohne
   * den status='dispatched'-Override von addShipmentToTour.
   * Sendung bleibt 'in_warehouse' bis Tour-Dispatch.
   * Returns {ok, reason?}.
   */
  private async tryLinkToFvTour(
    tourId: string,
    shipmentId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    try {
      const tour = await this.prisma.tours.findUnique({
        where: { id: tourId },
        select: {
          id: true,
          status: true,
          subcontractor_id: true,
          subcontractors: { select: { has_adr_license: true } },
          shipments: {
            where: { deleted_at: null },
            select: { id: true, tour_position: true },
          },
        },
      });
      if (!tour) return { ok: false, reason: 'tour_not_found' };
      // R2.2 Verify: nur 'planned' Touren konsolidieren — eine
      // 'dispatched' (= bereits unterwegs) Tour darf KEINE neue
      // Sendung mehr kriegen. Schützt vor Match-Treffer auf
      // dispatched Tour aus findBestMatchForShipment (das aktuell
      // planned+dispatched returnt).
      if (tour.status !== 'planned') {
        return { ok: false, reason: 'tour_not_planned' };
      }
      const ship = await this.prisma.shipments.findFirst({
        where: { id: shipmentId, deleted_at: null },
        select: { id: true, tour_id: true, is_hazmat: true },
      });
      if (!ship) return { ok: false, reason: 'shipment_not_found' };
      if (ship.tour_id)
        return { ok: false, reason: 'shipment_already_assigned' };
      // R2.1: Hazmat-Block nur wenn Sub bereits zugewiesen UND keine
      // ADR-Lizenz. Bei null-Sub (auto-created Tour) wird die Prüfung
      // beim Sub-Zuweisen/Dispatch erneut greifen — hier nicht
      // blockieren, sonst landet jede hazmat-CHARTER_UMSCHLAG-Sendung
      // ohne Konsolidierung.
      if (
        ship.is_hazmat &&
        tour.subcontractors &&
        !tour.subcontractors.has_adr_license
      ) {
        return { ok: false, reason: 'hazmat_no_adr' };
      }
      const maxPos = tour.shipments.reduce(
        (m, s) => Math.max(m, Number(s.tour_position) || 0),
        0,
      );
      // R2.4: race-safe — atomic update mit tour_id=null als Pre-
      // Condition. Wenn parallel-Call schon zugewiesen hat → count=0.
      // status BLEIBT 'in_warehouse' (anders als addShipmentToTour).
      const result = await this.prisma.shipments.updateMany({
        where: { id: shipmentId, tour_id: null, deleted_at: null },
        data: {
          tour_id: tourId,
          tour_position: maxPos + 1,
        },
      });
      if (result.count === 0) {
        return { ok: false, reason: 'race_lost' };
      }
      setImmediate(() => {
        void this.safeRecomputeIsCharterFv(tourId).then(() => {
          void this.safeRecomputeFvSchedule(tourId);
          // R2.2: HAUPTLAUF-Kosten + Auto-Dispatch nach erfolg-
          // reichem Link. Best-effort, beide fangen Fehler.
          void this.recordHauptlaufCost(tourId, shipmentId);
          void this.checkAndAutoDispatch(tourId);
        });
      });
      return { ok: true };
    } catch (err: any) {
      this.logger.warn(
        `tryLinkToFvTour(${tourId}, ${shipmentId}) failed: ${err?.message ?? err}`,
      );
      return { ok: false, reason: 'exception' };
    }
  }

  /**
   * R2.2: HAUPTLAUF-Kosten persistieren analog VORLAUF-Pattern.
   *
   * Schritte:
   *   1. CostsService.calculateMainCarriageCost (best-effort, kann
   *      NotFoundException werfen wenn kein cost_rate vorhanden)
   *   2. Re-Read shipments.main_carriage_cost (von Step 1 gesetzt)
   *   3. Upsert shipment_cost_components: phase='HAUPTLAUF',
   *      nv_tour_id=NULL, kapazitaet_anteil_eur=cost,
   *      faktoren={tour_id, source}
   *   Postgres `total_eur` ist GENERATED ALWAYS AS (Σ anteil-cols),
   *   wird automatisch befüllt.
   *
   * Unique-Constraint (shipment_id, phase, nv_tour_id=NULL) erlaubt
   * EINEN HAUPTLAUF-Record pro Sendung → klare 1:1-Zuordnung zur
   * FV-Tour (jede Sendung hat genau eine).
   */
  async recordHauptlaufCost(
    tourId: string,
    shipmentId: string,
  ): Promise<void> {
    try {
      try {
        await this.costs.calculateMainCarriageCost(shipmentId);
      } catch (err: any) {
        // Kein cost_rate vorhanden → Mensch trägt später nach.
        // Wir schreiben trotzdem ein Marker-Record mit cost=0,
        // damit FE die HAUPTLAUF-Zuordnung anzeigen kann.
        this.logger.warn(
          `recordHauptlaufCost calculateMain ${shipmentId}: ${err?.message ?? err}`,
        );
      }
      const ship = await this.prisma.shipments.findUnique({
        where: { id: shipmentId },
        select: { main_carriage_cost: true },
      });
      const cost = Number(ship?.main_carriage_cost ?? 0);
      const existing = await this.prisma.shipment_cost_components.findUnique({
        where: {
          shipment_id_phase_nv_tour_id: {
            shipment_id: shipmentId,
            phase: 'HAUPTLAUF',
            nv_tour_id: null as any,
          },
        },
        select: { id: true },
      });
      const faktoren: any = {
        tour_id: tourId,
        source: 'auto_consolidate',
      };
      if (existing) {
        await this.prisma.shipment_cost_components.update({
          where: { id: existing.id },
          data: {
            kapazitaet_anteil_eur: cost,
            faktoren,
            computed_at: new Date(),
          },
        });
      } else {
        await this.prisma.shipment_cost_components.create({
          data: {
            shipment_id: shipmentId,
            nv_tour_id: null,
            phase: 'HAUPTLAUF',
            kapazitaet_anteil_eur: cost,
            faktoren,
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `recordHauptlaufCost(${tourId}, ${shipmentId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * R2.2: Auto-Dispatch wenn FV-Tour voll ist UND Subunternehmer
   * zugewiesen ist.
   *
   * "Voll" = fillRatio ≥ 0.90, wobei
   *   fillRatio = max(usedLdm/maxLdm, usedKg/maxKg).
   *
   * Beide Bedingungen MÜSSEN erfüllt sein:
   *   - fillRatio ≥ 0.9 (voll-Schwelle)
   *   - subcontractor_id != null (sonst keine Fahrer = keine Fahrt)
   * Sonst bleibt Tour 'planned', Mensch handelt manuell.
   *
   * Idempotent: skip wenn status nicht 'planned'.
   */
  async checkAndAutoDispatch(tourId: string): Promise<void> {
    try {
      const tour = await this.prisma.tours.findUnique({
        where: { id: tourId },
        select: {
          id: true,
          status: true,
          subcontractor_id: true,
          max_ldm: true,
          max_weight_kg: true,
          shipments: {
            where: { deleted_at: null },
            select: { ldm: true, weight_kg: true },
          },
        },
      });
      if (!tour) return;
      if (tour.status !== 'planned') return;
      if (!tour.subcontractor_id) return;
      const maxLdm = Number(tour.max_ldm ?? 13.6);
      const maxKg = Number(tour.max_weight_kg ?? 24000);
      let usedLdm = 0;
      let usedKg = 0;
      for (const s of tour.shipments) {
        usedLdm += Number(s.ldm ?? 0);
        usedKg += Number(s.weight_kg ?? 0);
      }
      const ldmRatio = maxLdm > 0 ? usedLdm / maxLdm : 0;
      const kgRatio = maxKg > 0 ? usedKg / maxKg : 0;
      const fillRatio = Math.max(ldmRatio, kgRatio);
      if (fillRatio < 0.9) return;
      await this.dispatchTour(tourId);
      this.logger.log(
        `Auto-dispatch ${tourId} (fillRatio=${fillRatio.toFixed(2)}, sub=${tour.subcontractor_id})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `checkAndAutoDispatch(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
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
      void this.safeRecomputeIsCharterFv(tourId).then(() => {
        void this.safeRecomputeFvSchedule(tourId);
      });
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
      void this.safeRecomputeIsCharterFv(tourId).then(() => {
        void this.safeRecomputeFvSchedule(tourId);
      });
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
  async findBestMatchForShipment(
    shipmentId: string,
    opts: { excludeTourId?: string } = {},
  ) {
    if (!shipmentId) return [];
    // F2.2.b-0: Swap-Modus — Source-Tour aus Kandidaten ausschliessen.
    // Default (kein opts) bleibt exakt pre-F2-Verhalten.
    const excludeTourId = opts.excludeTourId;
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

    // FV-Touren-Pool (planned/dispatched).
    // B1: + subcontractors.name (Sub/Fahrer), + _count.shipments (Stop-
    // Anzahl), + city aus last-stop loading-address — fuer Empfehlungs-
    // Cards im ContextPanel.
    const fvTours = await this.prisma.tours.findMany({
      where: {
        status: { in: ['planned', 'dispatched'] },
        ...(excludeTourId ? { id: { not: excludeTourId } } : {}),
      },
      select: {
        id: true,
        tour_number: true,
        tour_date: true,
        status: true,
        max_ldm: true,
        max_weight_kg: true,
        total_ldm: true,
        total_weight_kg: true,
        subcontractors: { select: { name: true } },
        _count: { select: { shipments: { where: { deleted_at: null } } } },
        shipments: {
          where: { deleted_at: null },
          orderBy: { tour_position: 'desc' },
          take: 1,
          select: {
            customer_id: true,
            addresses_shipments_loading_address_idToaddresses: {
              select: { lat: true, lng: true, city: true },
            },
          },
        },
      },
      take: 100,
    });

    // NV-Touren-Pool (PLANNING/IN_PROGRESS).
    // B1: + subunternehmer.name, + _count.stops, + city analog FV.
    const nvTours = await this.prisma.nv_touren.findMany({
      where: {
        status: { in: ['PLANNING', 'IN_PROGRESS'] },
        ...(excludeTourId ? { id: { not: excludeTourId } } : {}),
      },
      select: {
        id: true,
        datum: true,
        status: true,
        subunternehmer: {
          select: { name: true, max_ldm: true, max_gewicht_kg: true },
        },
        _count: { select: { stops: true } },
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
                  select: { lat: true, lng: true, city: true },
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
          subunternehmer_name: t.subcontractors?.name ?? null,
          stops_count: t._count?.shipments ?? null,
          last_stop_city:
            last?.addresses_shipments_loading_address_idToaddresses?.city ??
            null,
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
          subunternehmer_name: t.subunternehmer?.name ?? null,
          stops_count: t._count?.stops ?? null,
          last_stop_city:
            last?.addresses_shipments_loading_address_idToaddresses?.city ??
            null,
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
      // 4. R2.1: CHARTER_UMSCHLAG nach NV-PICKUP (status=in_warehouse).
      //    classification=CHARTER_UMSCHLAG hat delivery-ZIP IN NV-Gebiet,
      //    Loading kann in/out NV liegen. Nach completed NV-Vorhol-Tour
      //    wartet die Sendung im Umschlag-Lager auf FV-Hauptlauf —
      //    Branches 1-3 fangen sie NICHT ab (kein relation_id, kein
      //    partner_delivered, Loading nicht zwingend outside-NV).
      {
        AND: [
          { classification: 'CHARTER_UMSCHLAG' },
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
            volume_m3: true,
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
              volume_m3: true,
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
    let curVolM3 = 0;
    for (const s of tour.shipments) {
      if (removedSet.has(s.id)) continue;
      curLdm += Number(s.ldm ?? 0);
      curKg += Number(s.weight_kg ?? 0);
      curVolM3 += Number(s.volume_m3 ?? 0);
    }
    for (const s of addsShipments) {
      curLdm += Number(s.ldm ?? 0);
      curKg += Number(s.weight_kg ?? 0);
      curVolM3 += Number(s.volume_m3 ?? 0);
    }
    // B-4: Overload NICHT blockend. Capacity-Ratio wird in
    // findOne-Response zurückgegeben. dispatchTour/releaseTour
    // prüft Overload und throwt bei isOverloaded.
    // O-3: vol+weight triggert, ldm bleibt INFO.
    const maxLdm = tour.max_ldm != null ? Number(tour.max_ldm) : null;
    const overload = computeOverload(
      curLdm,
      curKg,
      maxLdm,
      tour.max_weight_kg != null ? Number(tour.max_weight_kg) : null,
      curVolM3,
      deriveMaxVolM3(maxLdm),
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
      void this.safeRecomputeIsCharterFv(tourId).then(() => {
        void this.safeRecomputeFvSchedule(tourId);
      });
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

  /** Map-Routing P1: tour.is_charter ableiten nach Stop-Set. */
  private async safeRecomputeIsCharterFv(tourId: string) {
    try {
      const shipments = await this.prisma.shipments.findMany({
        where: { tour_id: tourId, deleted_at: null },
        select: { classification: true },
      });
      const next = deriveIsCharter({
        shipments: shipments.map((s) => ({ classification: s.classification })),
      });
      await this.prisma.tours.update({
        where: { id: tourId },
        data: { is_charter: next },
      });
    } catch (err: any) {
      this.logger.warn(
        `safeRecomputeIsCharterFv(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Map-Routing R3: Full-Recompute für Admin-Bulk-Job.
   * Sequenz: is_charter → optimize → schedule.
   * Idempotent + best-effort.
   */
  async recomputeTourFull(tourId: string): Promise<void> {
    await this.safeRecomputeIsCharterFv(tourId);
    await this.safeOptimizeFvTour(tourId);
    await this.safeRecomputeFvSchedule(tourId);
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
    const tour: any = await this.prisma.tours.findUnique({
      where: { id: tourId },
      select: {
        id: true,
        tour_date: true,
        departure_time: true,
        is_charter: true,
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

    // Map-Routing P0 + Fix#1: startCoord-Logik IDENTISCH zu
    // buildTourRoute-FV-Fallback. Eine Wahrheit zwischen
    // Polyline-Start und Schedule-Start.
    //   is_charter        → null (kein WH-Vorlauf)
    //   !is_charter:
    //     hub_start vorh. → hub_start
    //     sonst           → default-warehouse-coord
    const isCharter = (tour as { is_charter?: boolean }).is_charter ?? false;
    let startCoord: { lat: number; lng: number } | null = null;
    if (!isCharter) {
      if (
        tour.hub_start_address?.lat != null &&
        tour.hub_start_address?.lng != null
      ) {
        startCoord = {
          lat: Number(tour.hub_start_address.lat),
          lng: Number(tour.hub_start_address.lng),
        };
      } else {
        // Fix#1: default-warehouse-Fallback (matched routeOnlyForFvTour).
        const wh = await this.prisma.warehouses.findFirst({
          where: { is_default: true, active: true },
          select: { lat: true, lng: true },
        });
        if (wh && wh.lat != null && wh.lng != null) {
          startCoord = { lat: Number(wh.lat), lng: Number(wh.lng) };
        }
      }
    }

    // C1-D: FV precise-eta via OSRM (Parity zu NV).
    // legDurationsSec[i] = travel-Time von prev (oder startCoord)
    // zu shipment[i].delivery_address.
    let legDurationsSec: number[] | undefined;
    const osrmCoords: Array<[number, number]> = [];
    if (startCoord) osrmCoords.push([startCoord.lng, startCoord.lat]);
    for (const s of tour.shipments) {
      const a = s.addresses_shipments_delivery_address_idToaddresses;
      if (a?.lat != null && a?.lng != null) {
        osrmCoords.push([Number(a.lng), Number(a.lat)]);
      }
    }
    if (osrmCoords.length >= 2) {
      try {
        const r = await routeWithDurations(osrmCoords);
        if (r && r.legs.length >= 1) {
          const offset = startCoord ? 0 : 1;
          const durations: number[] = tour.shipments.map(
            (_: unknown, i: number) =>
              r.legs[i - offset]?.duration_sec ?? 0,
          );
          if (!startCoord && durations.length > 0) {
            durations[0] = 0;
          }
          legDurationsSec = durations;
        }
      } catch (err: any) {
        this.logger.warn(
          `FV precise-eta routeWithDurations failed (${tourId}): ${err?.message ?? err}`,
        );
      }
    }

    const sched = computeFvSchedule({
      tourDate: tour.tour_date,
      departureTime: tour.departure_time,
      startCoord,
      legDurationsSec,
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
    const tour: any = await this.prisma.tours.findUnique({
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
    const isCharter = (tour as { is_charter?: boolean }).is_charter ?? false;

    const stops: Array<{ id: string; lat: number; lng: number }> = [];
    for (const s of tour.shipments) {
      const addr = s.addresses_shipments_loading_address_idToaddresses;
      if (!addr || addr.lat == null || addr.lng == null) continue;
      const lat = Number(addr.lat);
      const lng = Number(addr.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stops.push({ id: s.id, lat, lng });
    }
    if (stops.length === 0) {
      this.logger.warn(
        `routeOnlyForFvTour(${tourId}): no shipment coords — skip`,
      );
      return null;
    }

    // Map-Routing P0: hub_start/end fallback auf default-warehouse
    // wenn FV-Tour keinen eigenen Hub hat (non-Charter only).
    let startHub: { lat: number; lng: number } | null = null;
    let endHub: { lat: number; lng: number } | null = null;
    if (!isCharter) {
      if (tour.hub_start_address?.lat != null && tour.hub_start_address?.lng != null) {
        startHub = {
          lat: Number(tour.hub_start_address.lat),
          lng: Number(tour.hub_start_address.lng),
        };
      }
      if (tour.hub_end_address?.lat != null && tour.hub_end_address?.lng != null) {
        endHub = {
          lat: Number(tour.hub_end_address.lat),
          lng: Number(tour.hub_end_address.lng),
        };
      }
      // Fallback default-warehouse wenn beide Hubs fehlen.
      if (!startHub && !endHub) {
        const wh = await this.prisma.warehouses.findFirst({
          where: { is_default: true, active: true },
          select: { lat: true, lng: true },
        });
        if (wh && wh.lat != null && wh.lng != null) {
          startHub = { lat: Number(wh.lat), lng: Number(wh.lng) };
          endHub = startHub;
        }
      }
    }

    const routeCoords = buildTourRoute({
      stops,
      startHub,
      endHub,
      isCharter,
    });
    const coords: Array<[number, number]> = routeCoords.map((r) => r.coord);
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
    const tour: any = await this.prisma.tours.findUnique({
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
    const isCharter = (tour as { is_charter?: boolean }).is_charter ?? false;

    const stopsWithCoords: Array<{ id: string; lat: number; lng: number }> = [];
    for (const s of tour.shipments) {
      const addr = s.addresses_shipments_loading_address_idToaddresses;
      if (!addr || addr.lat == null || addr.lng == null) continue;
      const lat = Number(addr.lat);
      const lng = Number(addr.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stopsWithCoords.push({ id: s.id, lat, lng });
    }
    if (stopsWithCoords.length === 0) {
      this.logger.warn(
        `optimizeFvTour(${tourId}): no shipment-coords — skip`,
      );
      return null;
    }

    // Map-Routing P0: hub fallback default-warehouse (non-Charter).
    let startHub: { lat: number; lng: number } | null = null;
    let endHub: { lat: number; lng: number } | null = null;
    if (!isCharter) {
      if (tour.hub_start_address?.lat != null && tour.hub_start_address?.lng != null) {
        startHub = {
          lat: Number(tour.hub_start_address.lat),
          lng: Number(tour.hub_start_address.lng),
        };
      }
      if (tour.hub_end_address?.lat != null && tour.hub_end_address?.lng != null) {
        endHub = {
          lat: Number(tour.hub_end_address.lat),
          lng: Number(tour.hub_end_address.lng),
        };
      }
      if (!startHub && !endHub) {
        const wh = await this.prisma.warehouses.findFirst({
          where: { is_default: true, active: true },
          select: { lat: true, lng: true },
        });
        if (wh && wh.lat != null && wh.lng != null) {
          startHub = { lat: Number(wh.lat), lng: Number(wh.lng) };
          endHub = startHub;
        }
      }
    }

    if (stopsWithCoords.length === 1) {
      const routeCoords = buildTourRoute({
        stops: stopsWithCoords,
        startHub,
        endHub,
        isCharter,
      });
      const coords: Array<[number, number]> = routeCoords.map((r) => r.coord);
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

    // TSP-Optimize mit buildTourRoute (Hubs nur wenn non-Charter).
    const routeCoords = buildTourRoute({
      stops: stopsWithCoords,
      startHub,
      endHub,
      isCharter,
    });
    const coords: Array<[number, number]> = routeCoords.map((r) => r.coord);
    const hubCountStart = isCharter ? 0 : startHub ? 1 : 0;
    const hubCountEnd = isCharter ? 0 : endHub ? 1 : 0;
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
      if (hubCountStart && inputIdx === 0) continue;
      if (hubCountEnd && inputIdx === lastIdx) continue;
      const stopIdx = inputIdx - hubCountStart;
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

  /**
   * C-2.1 FV Sendung-Splitten:
   *   - FV hat keine stops — direkte tour.shipments[]-Relation.
   *   - Original-Shipment hat tour_id == tourId; neue Shipment
   *     wird mit gleicher tour_id + tour_position+1 angelegt.
   *   - Items werden über NvTourenService.executeShipmentSplit
   *     + applyShipmentSplit verteilt (geteilte Logik).
   */
  async splitShipmentInTour(
    tourId: string,
    shipmentId: string,
    itemSplits: Array<{ itemId: string; quantity: number }>,
  ) {
    if (!itemSplits || itemSplits.length === 0) {
      throw new BadRequestException('itemSplits darf nicht leer sein.');
    }
    const ship = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        tour_id: true,
        tour_position: true,
        package_count: true,
        shipment_package_items: {
          orderBy: { line_index: 'asc' },
          select: {
            id: true,
            line_index: true,
            package_type: true,
            quantity: true,
            length_cm: true,
            width_cm: true,
            height_cm: true,
            weight_kg: true,
            stackable: true,
          },
        },
      },
    });
    if (!ship) throw new NotFoundException('Sendung nicht gefunden');
    if (ship.tour_id !== tourId) {
      throw new BadRequestException(
        'Sendung gehört nicht zur angegebenen Tour.',
      );
    }
    const plan = await this.nvTouren.executeShipmentSplit(ship, itemSplits);

    return this.prisma.$transaction(async (tx) => {
      const exec = await this.nvTouren.applyShipmentSplit(
        tx,
        ship.id,
        plan,
      );
      // Neue Shipment in dieselbe Tour einfügen, position+1.
      // Nachfolgende shipments shiften.
      const nextPos = (ship.tour_position ?? 0) + 1;
      await tx.shipments.updateMany({
        where: {
          tour_id: tourId,
          tour_position: { gte: nextPos },
          id: { not: exec.newShipmentId },
        },
        data: { tour_position: { increment: 1 } },
      });
      await tx.shipments.update({
        where: { id: exec.newShipmentId },
        data: {
          tour_id: tourId,
          tour_position: nextPos,
        },
      });
      return {
        original_shipment_id: ship.id,
        new_shipment_id: exec.newShipmentId,
        new_shipment_number: exec.newShipmentNumber,
        moved_item_count: plan.movedItemCount,
        cloned_item_count: plan.clonedItemCount,
      };
    });
  }

  /**
   * Sprint Map-Routing: nearby-shipments für FV.
   * Filter: FV-eligible (deleted_at=null, tour_id=null, status='new',
   * transport_type ∈ FV_TRANSPORT_TYPES). Haversine ≤ radius_km zu
   * mindestens 1 Tour-Stop.
   */
  async nearbyShipmentsFv(tourId: string, radius_km = 20) {
    const tour: any = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        shipments: {
          where: { deleted_at: null },
          include: {
            addresses_shipments_loading_address_idToaddresses: {
              select: { lat: true, lng: true },
            },
          },
        },
      },
    });
    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);
    const stopCoords: Array<{ lat: number; lng: number }> = [];
    for (const sh of tour.shipments) {
      const a = sh.addresses_shipments_loading_address_idToaddresses;
      if (a?.lat != null && a?.lng != null) {
        stopCoords.push({ lat: Number(a.lat), lng: Number(a.lng) });
      }
    }
    if (stopCoords.length === 0) return [];

    const candidates = await this.prisma.shipments.findMany({
      where: {
        deleted_at: null,
        tour_id: null,
        status: { in: ['new', 'in_warehouse'] },
        transport_type: { in: [...FV_TRANSPORT_TYPES] },
      },
      select: {
        id: true,
        shipment_number: true,
        weight_kg: true,
        ldm: true,
        volume_m3: true,
        length_cm: true,
        width_cm: true,
        height_cm: true,
        effective_pallets: true,
        loading_date: true,
        // S-6.1: Empfaenger-Gruppierung. transport_type entscheidet
        // ueber Slot-Logik (Sammelgut → Depot/Relation; Direkt →
        // Empfangs-PLZ). relation+default_hall_location liefert das
        // Depot-Label.
        transport_type: true,
        relation_id: true,
        relation: {
          select: {
            code: true,
            default_hall_location: {
              select: { code: true, description: true },
            },
          },
        },
        customers: { select: { id: true, name: true } },
        addresses_shipments_loading_address_idToaddresses: {
          // S-6.2: street + country_code fuer Hof-Per-Sendung-Label.
          select: {
            lat: true,
            lng: true,
            zip: true,
            city: true,
            street: true,
            country_code: true,
          },
        },
        addresses_shipments_delivery_address_idToaddresses: {
          // S-6.2: country_code fuer Slot-Country-Prefix.
          select: { zip: true, city: true, country_code: true },
        },
      },
      take: 500,
    });
    const out: Array<{
      id: string;
      shipment_number: string;
      weight_kg: number | null;
      ldm: number | null;
      volume_m3: number | null;
      length_cm: number | null;
      width_cm: number | null;
      height_cm: number | null;
      effective_pallets: number | null;
      customer_name: string | null;
      lat: number;
      lng: number;
      zip: string | null;
      city: string | null;
      // S-6.2: Adress-Detail fuer Per-Sendung-Label + Country-Prefix
      loading_street: string | null;
      loading_country: string | null;
      distance_km: number;
      // S-6.1 Empfaenger-Gruppierung
      transport_type: string | null;
      delivery_zip: string | null;
      delivery_city: string | null;
      delivery_country: string | null;
      relation_id: string | null;
      relation_code: string | null;
      depot_label: string | null;
    }> = [];
    for (const c of candidates) {
      const a = c.addresses_shipments_loading_address_idToaddresses;
      if (!a?.lat || !a?.lng) continue;
      const cLat = Number(a.lat);
      const cLng = Number(a.lng);
      let minDist = Number.POSITIVE_INFINITY;
      for (const sc of stopCoords) {
        const R = 6371;
        const dLat = ((cLat - sc.lat) * Math.PI) / 180;
        const dLng = ((cLng - sc.lng) * Math.PI) / 180;
        const sinDLat = Math.sin(dLat / 2);
        const sinDLng = Math.sin(dLng / 2);
        const aH =
          sinDLat * sinDLat +
          Math.cos((sc.lat * Math.PI) / 180) *
            Math.cos((cLat * Math.PI) / 180) *
            sinDLng *
            sinDLng;
        const dd = 2 * R * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH));
        if (dd < minDist) minDist = dd;
      }
      if (minDist <= radius_km) {
        const delivery = c.addresses_shipments_delivery_address_idToaddresses;
        out.push({
          id: c.id,
          shipment_number: c.shipment_number,
          weight_kg: c.weight_kg ? Number(c.weight_kg) : null,
          ldm: c.ldm ? Number(c.ldm) : null,
          volume_m3: c.volume_m3 != null ? Number(c.volume_m3) : null,
          length_cm: c.length_cm ?? null,
          width_cm: c.width_cm ?? null,
          height_cm: c.height_cm ?? null,
          effective_pallets:
            c.effective_pallets != null ? Number(c.effective_pallets) : null,
          customer_name: c.customers?.name ?? null,
          lat: cLat,
          lng: cLng,
          zip: a.zip ?? null,
          city: a.city ?? null,
          loading_street: a.street ?? null,
          loading_country: a.country_code ?? null,
          distance_km: minDist,
          transport_type: c.transport_type ?? null,
          delivery_zip: delivery?.zip ?? null,
          delivery_city: delivery?.city ?? null,
          delivery_country: delivery?.country_code ?? null,
          relation_id: c.relation_id ?? null,
          relation_code: c.relation?.code ?? null,
          depot_label:
            c.relation?.default_hall_location?.description ??
            c.relation?.default_hall_location?.code ??
            null,
        });
      }
    }
    out.sort((a, b) => a.distance_km - b.distance_km);
    return out;
  }
}
