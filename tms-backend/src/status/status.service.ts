import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { shipment_status, Prisma } from '../../generated/prisma';

const SHIPMENT_INCLUDE = {
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
} satisfies Prisma.shipmentsInclude;

@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService) {}

  private mapEventToShipmentStatus(eventType: string): shipment_status | undefined {
    switch (eventType) {
      case 'VERLADEN':
        return 'in_transit';
      case 'ZUGESTELLT':
        return 'delivered';
      case 'RETOURE':
        return 'returned';
      default:
        return undefined;
    }
  }

  async addEvent(
    shipmentId: string,
    eventType: string,
    options?: {
      userId?: string;
      description?: string;
      location?: string;
      recipientName?: string;
      signatureData?: string;
      photoUrl?: string;
      isAutomatic?: boolean;
    },
  ) {
    const exists = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const now = new Date();
    const statusUpdate = this.mapEventToShipmentStatus(eventType);

    await this.prisma.$transaction([
      this.prisma.shipment_status_events.create({
        data: {
          shipment_id: shipmentId,
          event_type: eventType,
          description: options?.description ?? null,
          location: options?.location ?? null,
          performed_by: options?.userId ?? null,
          performed_at: now,
          recipient_name: options?.recipientName ?? null,
          signature_data: options?.signatureData ?? null,
          photo_url: options?.photoUrl ?? null,
          is_automatic: options?.isAutomatic ?? false,
        },
      }),
      this.prisma.shipments.update({
        where: { id: shipmentId },
        data: {
          last_event_type: eventType,
          last_event_at: now,
          ...(statusUpdate ? { status: statusUpdate } : {}),
        },
      }),
    ]);
  }

  async getHistory(shipmentId: string) {
    const s = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: { id: true, shipment_number: true, status: true },
    });
    if (!s) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const events = await this.prisma.shipment_status_events.findMany({
      where: { shipment_id: shipmentId },
      orderBy: { performed_at: 'asc' },
      include: {
        users: { select: { id: true, name: true, email: true } },
      },
    });

    return { shipment: s, events };
  }

  async getWorkstack(type: string) {
    switch (type) {
      case 'ohne_erststatus':
        return this.workstackOhneErststatus();
      case 'ohne_folgestatus':
        return this.workstackOhneFolgestatus();
      case 'zustellhindernisse':
        return this.workstackZustellhindernisse();
      case 'ueberfaellig':
        return this.workstackUeberfaellig();
      default:
        throw new NotFoundException(`Unbekannter Arbeitsstapel-Typ: ${type}`);
    }
  }

  private async workstackOhneErststatus() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.shipments.findMany({
      where: {
        deleted_at: null,
        status: 'new',
        created_at: { lt: cutoff },
      },
      select: { id: true },
    });
    if (!candidates.length) return [];

    const ids = candidates.map((c) => c.id);
    const withEingelagert = await this.prisma.shipment_status_events.findMany({
      where: {
        shipment_id: { in: ids },
        event_type: 'EINGELAGERT',
      },
      select: { shipment_id: true },
    });
    const hasScan = new Set(withEingelagert.map((e) => e.shipment_id));
    const missing = ids.filter((id) => !hasScan.has(id));
    if (!missing.length) return [];

    return this.prisma.shipments.findMany({
      where: { id: { in: missing } },
      include: SHIPMENT_INCLUDE,
      orderBy: [{ created_at: 'asc' }],
    });
  }

  private async workstackOhneFolgestatus() {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    return this.prisma.shipments.findMany({
      where: {
        deleted_at: null,
        status: 'in_transit',
        OR: [{ last_event_at: null }, { last_event_at: { lt: cutoff } }],
      },
      include: SHIPMENT_INCLUDE,
      orderBy: [{ last_event_at: 'asc' }, { delivery_date: 'asc' }],
    });
  }

  private async workstackZustellhindernisse() {
    const rows = await this.prisma.shipment_status_events.findMany({
      where: { event_type: 'ZUSTELLHINDERNIS' },
      select: { shipment_id: true },
    });
    const uniqueIds = [...new Set(rows.map((r) => r.shipment_id))];
    if (!uniqueIds.length) return [];

    return this.prisma.shipments.findMany({
      where: {
        id: { in: uniqueIds },
        deleted_at: null,
        status: { notIn: ['delivered', 'cancelled', 'invoiced', 'returned'] },
      },
      include: SHIPMENT_INCLUDE,
      orderBy: [{ delivery_date: 'asc' }],
    });
  }

  private async workstackUeberfaellig() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.prisma.shipments.findMany({
      where: {
        deleted_at: null,
        delivery_date: { lt: today },
        status: { notIn: ['delivered', 'cancelled', 'invoiced', 'returned'] },
      },
      include: SHIPMENT_INCLUDE,
      orderBy: [{ delivery_date: 'asc' }],
    });
  }

  async getBadgeSummary() {
    const [activeLockCount, openAdvisoryCount, openNvDispositionsCount, openDamagesCount, openSurplusCount] =
      await Promise.all([
        this.prisma.shipment_locks.count({ where: { is_active: true } }),
        this.prisma.advisories.count({
          where: { status: { in: ['open', 'contacted'] } },
        }),
        this.prisma.nv_dispositions.count({
          where: { status: 'open' },
        }),
        this.prisma.damage_reports.count({
          where: { status: 'open' },
        }),
        this.prisma.surplus_items.count({
          where: { status: { in: ['erfasst', 'nachbordero'] } },
        }),
      ]);

    return {
      activeLockCount,
      openAdvisoryCount,
      openNvDispositionsCount,
      openDamagesCount,
      openSurplusCount,
    };
  }
}
