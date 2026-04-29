import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatusService } from '../status/status.service';
import { LockService } from '../status/lock.service';
import { AdvisoryService } from '../status/advisory.service';
import { HallService } from '../hall/hall.service';
import type { CreateNvDispositionDto } from './dto/create-nv-disposition.dto';
import type { ResolveNvDispositionDto } from './dto/resolve-nv-disposition.dto';
import type { CreateDamageReportDto } from './dto/create-damage-report.dto';
import type { ResolveDamageReportDto } from './dto/resolve-damage-report.dto';
import type { CreateClaimDto } from './dto/create-claim.dto';
import type { CreateSurplusItemDto } from './dto/create-surplus-item.dto';

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: StatusService,
    private readonly locks: LockService,
    private readonly advisory: AdvisoryService,
    private readonly hall: HallService,
  ) {}

  private async getActiveShipmentKlaerfallLock(shipmentId: string) {
    return this.prisma.shipment_locks.findFirst({
      where: { shipment_id: shipmentId, lock_type: 'KLAERFALL', is_active: true },
      select: { id: true },
    });
  }

  private async getActiveShipmentDamageLock(shipmentId: string) {
    return this.prisma.shipment_locks.findFirst({
      where: {
        shipment_id: shipmentId,
        lock_type: 'BESCHAEDIGUNG',
        is_active: true,
      },
      select: { id: true },
    });
  }

  private async unlockIfPresent(lockId: string | null, resolutionNotes: string, userId: string) {
    if (!lockId) return;
    await this.locks.unlockShipment(lockId, resolutionNotes, userId);
  }

  // ─────────────────────────────────────────────────────────────
  // NV-Verfügung
  // ─────────────────────────────────────────────────────────────
  async createNvDisposition(shipmentId: string, dto: CreateNvDispositionDto, userId: string | null) {
    const nv = await this.prisma.nv_dispositions.create({
      data: {
        shipment_id: shipmentId,
        problem_type: dto.problemType,
        disposition_type: dto.dispositionType ?? null,
        driver_notes: dto.driverNotes ?? null,
        driver_photo_base64: dto.driverPhotoBase64 ?? null,
        notes: dto.notes ?? null,
        created_by: userId ?? dto.createdBy ?? null,
      },
    });

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: { has_nv_disposition: true },
    });

    const reason = dto.driverNotes ?? dto.problemType;
    if (userId) {
      await this.locks.lockShipment(shipmentId, 'KLAERFALL', reason, userId);
    } else {
      await this.locks.createDriverKlaerfallLock(shipmentId, reason);
    }

    await this.status.addEvent(shipmentId, 'ZUSTELLHINDERNIS', {
      description: reason,
      isAutomatic: false,
      userId: userId ?? undefined,
    });

    return this.prisma.nv_dispositions.findUnique({
      where: { id: nv.id },
      include: {
        shipments: {
          include: {
            customers: { select: { name: true } },
            addresses_shipments_delivery_address_idToaddresses: {
              select: {
                city: true,
                zip: true,
                contact_name: true,
                name: true,
                country_code: true,
              },
            },
          },
        },
      },
    });
  }

  async resolveNvDisposition(nvId: string, dto: ResolveNvDispositionDto, userId: string) {
    const nv = await this.prisma.nv_dispositions.findUnique({
      where: { id: nvId },
      select: { id: true, shipment_id: true, problem_type: true, status: true },
    });
    if (!nv) throw new NotFoundException(`NV-Verfügung ${nvId} nicht gefunden`);

    const shipmentId = nv.shipment_id;
    const lock = await this.getActiveShipmentKlaerfallLock(shipmentId);

    const now = new Date();
    const resolveNotes = dto.notes ?? `${dto.dispositionType} resolved`;

    // Clear open flag by default when resolved.
    const clearNvFlag = { has_nv_disposition: false };

    if (dto.dispositionType === 'RETRY') {
      if (!dto.retryDate) throw new BadRequestException('retryDate fehlt');

      const retryDate = new Date(`${dto.retryDate}T12:00:00.000Z`);
      // The DB uses DATE/TIME columns; we store them as ISO date/time strings converted by prisma below.
      const tf = dto.retryTimeFrom ? new Date(`1970-01-01T${dto.retryTimeFrom}:00Z`) : null;
      const tt = dto.retryTimeTo ? new Date(`1970-01-01T${dto.retryTimeTo}:00Z`) : null;

      await this.prisma.nv_dispositions.update({
        where: { id: nvId },
        data: {
          disposition_type: 'RETRY',
          retry_date: retryDate,
          retry_time_from: tf,
          retry_time_to: tt,
          status: 'resolved',
          resolved_by: userId,
          resolved_at: now,
        },
      });

      await this.prisma.shipments.update({
        where: { id: shipmentId },
        data: clearNvFlag,
      });

      // Create advisory optionally (UI Toggle).
      if (dto.retryRequiresAdvisory) {
        const s = await this.prisma.shipments.findUnique({
          where: { id: shipmentId },
          select: {
            addresses_shipments_delivery_address_idToaddresses: {
              select: { contact_name: true, contact_phone: true, contact_email: true },
            },
          } as any,
        });

        const deliveryAddress: any = s?.addresses_shipments_delivery_address_idToaddresses;
        await this.advisory.createAdvisory(
          shipmentId,
          {
            advisoryType: 'RETRY',
            contactName: deliveryAddress?.contact_name ?? undefined,
            contactPhone: deliveryAddress?.contact_phone ?? undefined,
            contactEmail: deliveryAddress?.contact_email ?? undefined,
            notes: dto.retryNotes ?? undefined,
          },
          userId,
        );
      }

      await this.unlockIfPresent(lock?.id ?? null, resolveNotes, userId);
      await this.status.addEvent(shipmentId, 'NEUER_ZUSTELLVERSUCH', {
        description: dto.retryDate ? `Retry am ${dto.retryDate}` : undefined,
        isAutomatic: false,
        userId,
      });

      return this.prisma.nv_dispositions.findUnique({ where: { id: nvId } });
    }

    if (dto.dispositionType === 'RETURN') {
      const returnCostEur = dto.returnCostEur ?? 0;
      const returnType = 'ZUM_VERSENDER';
      const returnReason = dto.returnReason ?? nv.problem_type;

      await this.prisma.nv_dispositions.update({
        where: { id: nvId },
        data: {
          disposition_type: 'RETURN',
          return_cost_eur: returnCostEur,
          return_cost_bearer: dto.returnCostBearer ?? null,
          notes: dto.notes ?? null,
          status: 'resolved',
          resolved_by: userId,
          resolved_at: now,
        },
      });

      const created = await this.prisma.returns.create({
        data: {
          shipment_id: shipmentId,
          nv_disposition_id: nvId,
          return_reason: returnReason,
          return_type: returnType,
          return_cost_eur: returnCostEur,
          cost_bearer: dto.returnCostBearer ?? null,
          created_by: userId,
        },
      });

      await this.prisma.shipments.update({
        where: { id: shipmentId },
        data: {
          status: 'returned',
          has_return: true,
          return_status: 'returned',
          ...clearNvFlag,
        },
      });

      await this.unlockIfPresent(lock?.id ?? null, resolveNotes, userId);
      await this.status.addEvent(shipmentId, 'RETOURE', {
        description: dto.returnReason ?? 'Retoure',
        isAutomatic: false,
        userId,
      });

      return created;
    }

    if (dto.dispositionType === 'SELF_PICKUP') {
      const untilDate = dto.selfPickupUntilDate ? new Date(`${dto.selfPickupUntilDate}T12:00:00.000Z`) : null;

      const avis = await this.prisma.hall_locations.findFirst({
        where: { type: 'AVIS', is_active: true },
        orderBy: { code: 'asc' },
        select: { id: true, code: true },
      });
      if (!avis) throw new NotFoundException('Kein AVIS-Hallenplatz vorhanden');

      const s = await this.prisma.shipments.findUnique({
        where: { id: shipmentId },
        select: {
          addresses_shipments_delivery_address_idToaddresses: {
            select: { contact_name: true, contact_phone: true, contact_email: true },
          },
        } as any,
      });
      const deliveryAddress: any = (s as any)?.addresses_shipments_delivery_address_idToaddresses?.[0];

      await this.prisma.nv_dispositions.update({
        where: { id: nvId },
        data: {
          disposition_type: 'SELF_PICKUP',
          notes: dto.selfPickupNotes ?? null,
          status: 'resolved',
          resolved_by: userId,
          resolved_at: now,
        },
      });

      await this.prisma.returns.create({
        data: {
          shipment_id: shipmentId,
          nv_disposition_id: nvId,
          return_reason: 'SELF_PICKUP',
          return_type: 'SELBSTABHOLER',
          created_by: userId,
        },
      });

      await this.advisory.createAdvisory(
        shipmentId,
        {
          advisoryType: 'SELBSTABHOLER',
          contactName: deliveryAddress?.contact_name ?? undefined,
          contactPhone: deliveryAddress?.contact_phone ?? undefined,
          contactEmail: deliveryAddress?.contact_email ?? undefined,
          portalUrl: undefined,
          notes: dto.selfPickupNotes ?? undefined,
        },
        userId,
      );

      // Put onto AVIS hall location.
      await this.hall.placeShipment(shipmentId, avis.code, userId);
      await this.status.addEvent(shipmentId, 'SELBSTABHOLER', {
        description: untilDate ? `Abholfrist bis ${dto.selfPickupUntilDate}` : 'Selbstabholer',
        isAutomatic: false,
        userId,
      });

      await this.prisma.shipments.update({
        where: { id: shipmentId },
        data: {
          status: 'returned',
          has_return: true,
          return_status: 'self_pickup',
          ...clearNvFlag,
        },
      });

      await this.unlockIfPresent(lock?.id ?? null, resolveNotes, userId);
      return this.prisma.nv_dispositions.findUnique({ where: { id: nvId } });
    }

    // STORAGE
    if (!dto.storageHallLocationId) throw new BadRequestException('storageHallLocationId fehlt');
    const hallLocation = await this.prisma.hall_locations.findUnique({
      where: { id: dto.storageHallLocationId },
      select: { id: true, code: true },
    });
    if (!hallLocation) throw new NotFoundException('Hallenplatz nicht gefunden');

    const storageStart = new Date();
    storageStart.setUTCHours(0, 0, 0, 0);

    await this.prisma.nv_dispositions.update({
      where: { id: nvId },
      data: {
        disposition_type: 'STORAGE',
        storage_start_date: storageStart,
        storage_daily_rate: dto.storageDailyRate ?? null,
        notes: dto.notes ?? null,
        status: 'resolved',
        resolved_by: userId,
        resolved_at: now,
      },
    });

    await this.prisma.returns.create({
      data: {
        shipment_id: shipmentId,
        nv_disposition_id: nvId,
        return_reason: 'EINLAGERUNG',
        return_type: 'EINLAGERUNG',
        created_by: userId,
        hall_location_id: hallLocation.id,
      },
    });

    await this.hall.placeShipment(shipmentId, hallLocation.code, userId);

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        status: 'returned',
        has_return: true,
        return_status: 'storage',
        ...clearNvFlag,
      },
    });

    await this.unlockIfPresent(lock?.id ?? null, resolveNotes, userId);
    return this.prisma.nv_dispositions.findUnique({ where: { id: nvId } });
  }

  // ─────────────────────────────────────────────────────────────
  // Damage
  // ─────────────────────────────────────────────────────────────
  async createDamageReport(shipmentId: string, dto: CreateDamageReportDto, userId: string | null) {
    const created = await this.prisma.damage_reports.create({
      data: {
        shipment_id: shipmentId,
        damage_type: dto.damageType,
        damage_cause: dto.damageCause ?? null,
        damage_description: dto.damageDescription,
        damage_value_eur: dto.damageValueEur ?? null,
        photo_base64_1: dto.photoBase64_1 ?? null,
        photo_base64_2: dto.photoBase64_2 ?? null,
        photo_base64_3: dto.photoBase64_3 ?? null,
        reported_by_driver: dto.reportedByDriver ?? false,
        liability_party: dto.liabilityParty ?? null,
        insurance_claim: dto.insuranceClaim ?? false,
        insurance_ref: dto.insuranceRef ?? null,
        created_by: userId ?? null,
      },
    });

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: { has_damage_report: true },
    });

    const reason = dto.damageDescription;
    if (userId) {
      await this.locks.lockShipment(shipmentId, 'BESCHAEDIGUNG', reason, userId);
    } else {
      // Driver trigger: no Dispatcher user.
      await this.prisma.shipment_locks.create({
        data: {
          shipment_id: shipmentId,
          lock_type: 'BESCHAEDIGUNG',
          reason,
          locked_by: null,
          is_active: true,
        },
      });
      await this.locks.refreshShipmentLockAggregate(shipmentId);
    }

    await this.status.addEvent(shipmentId, 'BESCHAEDIGT', {
      description: reason,
      isAutomatic: false,
      userId: userId ?? undefined,
    });

    return this.prisma.damage_reports.findUnique({
      where: { id: created.id },
      include: {
        shipments: {
          include: {
            customers: { select: { name: true } },
            addresses_shipments_delivery_address_idToaddresses: {
              select: { city: true, contact_name: true, name: true, zip: true },
            },
          },
        },
      },
    });
  }

  async resolveDamageReport(
    damageId: string,
    dto: ResolveDamageReportDto,
    userId: string,
  ) {
    const dr = await this.prisma.damage_reports.findUnique({
      where: { id: damageId },
      select: { id: true, shipment_id: true, damage_value_eur: true },
    });
    if (!dr) throw new NotFoundException(`Damage ${damageId} nicht gefunden`);

    const lock = await this.getActiveShipmentDamageLock(dr.shipment_id);
    const now = new Date();

    const isFinal = dto.status === 'abgeschlossen' || dto.status === 'abgewiesen';

    // Update damage report fields based on evaluation inputs.
    let finalResolutionNotes: string | null = dto.resolutionNotes ?? null;
    if (dto.kulanzDecision != null) {
      const line = `Kulanzentscheidung: ${dto.kulanzDecision ? 'JA' : 'NEIN'}`;
      finalResolutionNotes = finalResolutionNotes
        ? `${finalResolutionNotes}\n${line}`
        : line;
    }

    await this.prisma.damage_reports.update({
      where: { id: damageId },
      data: {
        status: dto.status,
        damage_type: dto.damageType ?? undefined,
        damage_value_eur:
          dto.damageValueEur != null ? Number(dto.damageValueEur) : undefined,
        damage_cause: dto.damageCause ?? undefined,
        liability_party: dto.liabilityParty ?? null,
        resolution_notes: finalResolutionNotes,
        insurance_claim: dto.insuranceClaim ?? undefined,
        insurance_ref: dto.insuranceRef ?? null,
        resolved_by: userId,
        resolved_at: now,
      },
    });

    await this.prisma.shipments.update({
      where: { id: dr.shipment_id },
      data: { has_damage_report: !isFinal },
    });

    if (isFinal) {
      await this.unlockIfPresent(
        lock?.id ?? null,
        dto.resolutionNotes ?? 'Schaden abgeschlossen',
        userId,
      );
    }

    // Create claim if requested (Reklamation / Versicherung).
    const shouldCreateClaim = dto.createClaim || dto.insuranceClaim;
    if (shouldCreateClaim) {
      if (dto.insuranceClaim) {
        await this.createClaim(dr.shipment_id, {
          shipmentId: dr.shipment_id,
          damageReportId: damageId,
          claimType: 'SCHADEN',
          claimAgainst: 'VERSICHERUNG',
          claimAmountEur: dto.claimAmountEur ?? dto.damageValueEur ?? undefined,
          partnerRef: undefined,
        }, userId);
      } else if (dto.createClaim) {
        await this.createClaim(dr.shipment_id, {
          shipmentId: dr.shipment_id,
          damageReportId: damageId,
          claimType: 'SCHADEN',
          claimAgainst: dto.claimAgainst ?? 'PARTNER',
          claimAmountEur: dto.claimAmountEur ?? undefined,
          partnerRef: undefined,
        }, userId);
      }
    }

    return this.prisma.damage_reports.findUnique({ where: { id: damageId } });
  }

  async createClaim(shipmentId: string, dto: CreateClaimDto, userId: string) {
    const created = await this.prisma.claims.create({
      data: {
        shipment_id: shipmentId,
        damage_report_id: dto.damageReportId ?? null,
        claim_type: dto.claimType,
        claim_against: dto.claimAgainst,
        claim_amount_eur: dto.claimAmountEur ?? null,
        partner_ref: dto.partnerRef ?? null,
        deadline_date: dto.deadlineDate ? new Date(`${dto.deadlineDate}T12:00:00.000Z`) : null,
        notes: dto.notes ?? null,
        created_by: userId,
      },
    });

    // Placeholder for template generation.
    // In a later sprint we can generate a PDF/Document via DocumentsModule.
    void created;

    return created;
  }

  // ─────────────────────────────────────────────────────────────
  // Workstack lists
  // ─────────────────────────────────────────────────────────────
  async getWorkstackNvDispositions() {
    return this.prisma.nv_dispositions.findMany({
      where: { status: 'open' },
      orderBy: { reported_at: 'asc' },
      include: {
        shipments: {
          include: {
            customers: { select: { name: true } },
            addresses_shipments_delivery_address_idToaddresses: {
              select: { contact_name: true, city: true, name: true, zip: true },
            },
          },
        },
      },
    });
  }

  async getWorkstackDamages() {
    return this.prisma.damage_reports.findMany({
      where: { status: 'open' },
      orderBy: { reported_at: 'asc' },
      include: {
        shipments: {
          include: {
            customers: { select: { name: true } },
            addresses_shipments_delivery_address_idToaddresses: {
              select: { contact_name: true, city: true, name: true, zip: true },
            },
          },
        },
      },
    });
  }

  async getWorkstackReturns() {
    // "aktive Retouren" => alles außer zugestellt
    const list = await this.prisma.returns.findMany({
      where: { status: { in: ['erfasst', 'auf_lager', 'unterwegs'] } },
      orderBy: { created_at: 'desc' },
      include: {
        shipments: {
          include: {
            customers: { select: { name: true } },
            addresses_shipments_delivery_address_idToaddresses: {
              select: { contact_name: true, city: true, name: true, zip: true },
            },
          },
        },
      },
    });
    return list;
  }

  async getWorkstackSurplus() {
    const items = await this.prisma.surplus_items.findMany({
      where: { status: { in: ['erfasst', 'nachbordero'] } },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        tour_id: true,
        description: true,
        weight_kg: true,
        package_count: true,
        photo_base64: true,
        scan_code: true,
        matched_shipment_id: true,
        hall_location_id: true,
        status: true,
        created_at: true,
      },
    });

    const matchedIds = items.map((i) => i.matched_shipment_id).filter(Boolean) as string[];
    const hallIds = items.map((i) => i.hall_location_id).filter(Boolean) as string[];
    const tourIds = items.map((i) => i.tour_id).filter(Boolean) as string[];
    const tours = await this.prisma.tours.findMany({
      where: { id: { in: tourIds } },
      select: { id: true, tour_number: true, tour_date: true },
    });
    const halls = await this.prisma.hall_locations.findMany({
      where: { id: { in: hallIds } },
      select: { id: true, code: true, type: true },
    });
    const shipments = await this.prisma.shipments.findMany({
      where: { id: { in: matchedIds } },
      select: { id: true, shipment_number: true, customers: { select: { name: true } } },
    });

    const hallById = new Map(halls.map((h) => [h.id, h]));
    const tourById = new Map(tours.map((t) => [t.id, t]));
    const shipById = new Map(shipments.map((s) => [s.id, s]));

    return items.map((it) => ({
      ...it,
      tour: it.tour_id ? tourById.get(it.tour_id) ?? null : null,
      hallLocation: it.hall_location_id ? hallById.get(it.hall_location_id) ?? null : null,
      matchedShipment: it.matched_shipment_id ? shipById.get(it.matched_shipment_id) ?? null : null,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Surplus actions
  // ─────────────────────────────────────────────────────────────
  async createSurplusItem(tourId: string, dto: CreateSurplusItemDto, userId: string) {
    if (!dto.hallLocationId) {
      throw new BadRequestException('hallLocationId fehlt');
    }

    let matchedShipmentId: string | null = null;
    let status: string = 'erfasst';

    if (dto.scanCode) {
      const match = await this.prisma.shipments.findFirst({
        where: { shipment_number: dto.scanCode, deleted_at: null },
        select: { id: true },
      });
      if (match) {
        matchedShipmentId = match.id;
        status = 'zugeordnet';
      }
    }

    return this.prisma.surplus_items.create({
      data: {
        tour_id: tourId,
        description: dto.description,
        weight_kg: dto.weightKg,
        package_count: dto.packageCount,
        photo_base64: dto.photoBase64 ?? null,
        scan_code: dto.scanCode ?? null,
        matched_shipment_id: matchedShipmentId,
        hall_location_id: dto.hallLocationId,
        status,
        created_by: userId,
      },
    });
  }

  async matchSurplusItem(surplusId: string, shipmentId: string, userId: string) {
    const item = await this.prisma.surplus_items.findUnique({
      where: { id: surplusId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException(`ÜZ ${surplusId} nicht gefunden`);

    await this.prisma.surplus_items.update({
      where: { id: surplusId },
      data: { matched_shipment_id: shipmentId, status: 'zugeordnet' },
    });

    return this.prisma.surplus_items.findUnique({ where: { id: surplusId } });
  }

  // ─────────────────────────────────────────────────────────────
  // Return/Supplier actions for Workstack buttons
  // ─────────────────────────────────────────────────────────────
  async assignReturnTour(returnId: string, returnTourId: string, userId: string) {
    const ret = await this.prisma.returns.findUnique({
      where: { id: returnId },
      select: { id: true, shipment_id: true },
    });
    if (!ret) throw new NotFoundException(`Retour ${returnId} nicht gefunden`);

    return this.prisma.returns.update({
      where: { id: returnId },
      data: { return_tour_id: returnTourId, status: 'unterwegs' },
    });
  }

  async markReturnDelivered(returnId: string, userId: string) {
    const ret = await this.prisma.returns.findUnique({
      where: { id: returnId },
      select: { id: true, shipment_id: true },
    });
    if (!ret) throw new NotFoundException(`Retour ${returnId} nicht gefunden`);

    await this.prisma.shipments.update({
      where: { id: ret.shipment_id },
      data: { has_return: false, return_status: 'zugestellt' },
    });

    return this.prisma.returns.update({
      where: { id: returnId },
      data: { status: 'zugestellt' },
    });
  }

  async setSurplusStatus(surplusId: string, status: 'nachbordero' | 'entsorgt', userId: string) {
    return this.prisma.surplus_items.update({
      where: { id: surplusId },
      data: { status },
    });
  }
}

