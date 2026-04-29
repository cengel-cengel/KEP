import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatusService } from './status.service';
import { RELEASE_BLOCKING_LOCK_TYPES } from './status.constants';
import type { Prisma } from '../../generated/prisma';

const LOCK_LIST_INCLUDE = {
  shipments: {
    include: {
      customers: { select: { id: true, name: true } },
      business_partner: {
        select: { id: true, name: true, partner_number: true },
      },
      addresses_shipments_loading_address_idToaddresses: {
        select: { id: true, name: true, city: true, zip: true, country_code: true },
      },
      addresses_shipments_delivery_address_idToaddresses: {
        select: { id: true, name: true, city: true, zip: true, country_code: true },
      },
    },
  },
  locked_by_user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.shipment_locksInclude;

@Injectable()
export class LockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: StatusService,
  ) {}

  async refreshShipmentLockAggregate(shipmentId: string) {
    const active = await this.prisma.shipment_locks.findMany({
      where: { shipment_id: shipmentId, is_active: true },
      select: { lock_type: true },
    });
    const types = [...new Set(active.map((l) => l.lock_type))].sort().join(',');
    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        has_active_lock: active.length > 0,
        lock_types: types.length ? types : null,
      },
    });
  }

  async lockShipment(
    shipmentId: string,
    lockType: string,
    reason: string | undefined,
    userId: string,
    dueDate?: Date,
  ) {
    const s = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: { id: true },
    });
    if (!s) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const created = await this.prisma.shipment_locks.create({
      data: {
        shipment_id: shipmentId,
        lock_type: lockType,
        reason: reason ?? null,
        locked_by: userId,
        due_date: dueDate ?? null,
        is_active: true,
      },
    });

    await this.refreshShipmentLockAggregate(shipmentId);
    await this.status.addEvent(shipmentId, 'SPERRE_GESETZT', {
      userId,
      description: `${lockType}${reason ? `: ${reason}` : ''}`,
      isAutomatic: false,
    });

    return this.prisma.shipment_locks.findUnique({
      where: { id: created.id },
      include: LOCK_LIST_INCLUDE,
    });
  }

  /** Fahrer-App: Klarfall ohne Dispatcher-User, ohne SPERRE_GESETZT-Event */
  async createDriverKlaerfallLock(
    shipmentId: string,
    reason: string | undefined,
  ) {
    const s = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: { id: true },
    });
    if (!s) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    await this.prisma.shipment_locks.create({
      data: {
        shipment_id: shipmentId,
        lock_type: 'KLAERFALL',
        reason: reason ?? null,
        locked_by: null,
        is_active: true,
      },
    });

    await this.refreshShipmentLockAggregate(shipmentId);
  }

  async escalateLock(lockId: string, escalatedToUserId: string) {
    const lock = await this.prisma.shipment_locks.findUnique({
      where: { id: lockId },
    });
    if (!lock) throw new NotFoundException(`Sperre ${lockId} nicht gefunden`);
    if (!lock.is_active) {
      throw new BadRequestException('Nur aktive Sperren können eskaliert werden');
    }

    return this.prisma.shipment_locks.update({
      where: { id: lockId },
      data: {
        escalated_to: escalatedToUserId,
        escalated_at: new Date(),
      },
      include: LOCK_LIST_INCLUDE,
    });
  }

  async unlockShipment(lockId: string, resolutionNotes: string, userId: string) {
    const lock = await this.prisma.shipment_locks.findUnique({
      where: { id: lockId },
    });
    if (!lock) throw new NotFoundException(`Sperre ${lockId} nicht gefunden`);
    if (!lock.is_active) {
      throw new BadRequestException('Sperre ist bereits aufgehoben');
    }

    const now = new Date();
    await this.prisma.shipment_locks.update({
      where: { id: lockId },
      data: {
        is_active: false,
        resolved_by: userId,
        resolved_at: now,
        resolution_notes: resolutionNotes,
      },
    });

    await this.refreshShipmentLockAggregate(lock.shipment_id);
    await this.status.addEvent(lock.shipment_id, 'SPERRE_AUFGEHOBEN', {
      userId,
      description: resolutionNotes,
      isAutomatic: false,
    });
  }

  async getActiveLocks(shipmentId: string) {
    return this.prisma.shipment_locks.findMany({
      where: { shipment_id: shipmentId, is_active: true },
      orderBy: { locked_at: 'desc' },
      include: {
        locked_by_user: { select: { id: true, name: true } },
      },
    });
  }

  async getLockWorkstack(lockType?: string) {
    return this.prisma.shipment_locks.findMany({
      where: {
        is_active: true,
        ...(lockType ? { lock_type: lockType } : {}),
      },
      orderBy: [{ due_date: 'asc' }, { locked_at: 'desc' }],
      include: LOCK_LIST_INCLUDE,
    });
  }

  async getOverdueLocks() {
    const now = new Date();
    return this.prisma.shipment_locks.findMany({
      where: {
        is_active: true,
        due_date: { lt: now },
      },
      orderBy: { due_date: 'asc' },
      include: LOCK_LIST_INCLUDE,
    });
  }

  async findAllLocks(filters: { activeOnly?: boolean; lockType?: string }) {
    const where: Prisma.shipment_locksWhereInput = {};
    if (filters.activeOnly) where.is_active = true;
    if (filters.lockType) where.lock_type = filters.lockType;
    return this.prisma.shipment_locks.findMany({
      where,
      orderBy: [{ locked_at: 'desc' }],
      include: LOCK_LIST_INCLUDE,
    });
  }

  /** ADR/ZOLL-Sperren auf Sendungen der Tour (aktiv) */
  async countReleaseBlockingLocksOnTour(tourId: string): Promise<number> {
    return this.prisma.shipment_locks.count({
      where: {
        is_active: true,
        lock_type: { in: [...RELEASE_BLOCKING_LOCK_TYPES] },
        shipments: { tour_id: tourId, deleted_at: null },
      },
    });
  }

  async countActiveLocksOnTour(tourId: string): Promise<number> {
    return this.prisma.shipment_locks.count({
      where: {
        is_active: true,
        shipments: { tour_id: tourId, deleted_at: null },
      },
    });
  }

  async enrichToursWithReleaseBlockInfo<
    T extends { id: string; shipments?: { id: string }[] },
  >(tours: T[]) {
    if (!tours.length) return tours as (T & { releaseBlockingLockCount: number })[];

    const tourIds = tours.map((t) => t.id);
    const locks = await this.prisma.shipment_locks.findMany({
      where: {
        is_active: true,
        lock_type: { in: [...RELEASE_BLOCKING_LOCK_TYPES] },
        shipments: { tour_id: { in: tourIds }, deleted_at: null },
      },
      select: {
        shipment_id: true,
        shipments: { select: { tour_id: true } },
      },
    });

    const byTour = new Map<string, number>();
    for (const l of locks) {
      const tid = l.shipments?.tour_id;
      if (!tid) continue;
      byTour.set(tid, (byTour.get(tid) ?? 0) + 1);
    }

    return tours.map((t) => ({
      ...t,
      releaseBlockingLockCount: byTour.get(t.id) ?? 0,
    }));
  }
}
