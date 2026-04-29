import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatusService } from './status.service';
import type { Prisma } from '../../generated/prisma';

const ADVISORY_INCLUDE = {
  shipments: {
    include: {
      customers: { select: { id: true, name: true } },
      business_partner: {
        select: { id: true, name: true, partner_number: true },
      },
      addresses_shipments_delivery_address_idToaddresses: {
        select: {
          id: true,
          name: true,
          city: true,
          zip: true,
          country_code: true,
          contact_name: true,
          contact_phone: true,
          contact_email: true,
        },
      },
    },
  },
  users: { select: { id: true, name: true } },
} satisfies Prisma.advisoriesInclude;

@Injectable()
export class AdvisoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: StatusService,
  ) {}

  async createAdvisory(
    shipmentId: string,
    dto: {
      advisoryType: string;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string;
      portalUrl?: string;
      portalBookingRef?: string;
      notes?: string;
    },
    userId: string,
  ) {
    const s = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      select: { id: true },
    });
    if (!s) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const adv = await this.prisma.advisories.create({
      data: {
        shipment_id: shipmentId,
        advisory_type: dto.advisoryType,
        contact_name: dto.contactName ?? null,
        contact_phone: dto.contactPhone ?? null,
        contact_email: dto.contactEmail ?? null,
        portal_url: dto.portalUrl ?? null,
        portal_booking_ref: dto.portalBookingRef ?? null,
        notes: dto.notes ?? null,
        status: 'open',
        created_by: userId,
      },
      include: ADVISORY_INCLUDE,
    });

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        advisory_required: true,
        advisory_status: 'required',
      },
    });

    return adv;
  }

  async confirmAdvisory(
    advisoryId: string,
    scheduledDate: string,
    timeFrom?: string,
    timeTo?: string,
  ) {
    const adv = await this.prisma.advisories.findUnique({
      where: { id: advisoryId },
    });
    if (!adv) throw new NotFoundException(`Avisierung ${advisoryId} nicht gefunden`);

    const date = new Date(`${scheduledDate}T12:00:00.000Z`);
    const tf =
      timeFrom != null && timeFrom.length >= 5
        ? new Date(`1970-01-01T${timeFrom}:00.000Z`)
        : null;
    const tt =
      timeTo != null && timeTo.length >= 5
        ? new Date(`1970-01-01T${timeTo}:00.000Z`)
        : null;
    const now = new Date();

    const updated = await this.prisma.advisories.update({
      where: { id: advisoryId },
      data: {
        status: 'confirmed',
        scheduled_date: date,
        scheduled_time_from: tf,
        scheduled_time_to: tt,
        confirmed_at: now,
      },
      include: ADVISORY_INCLUDE,
    });

    await this.prisma.shipments.update({
      where: { id: adv.shipment_id },
      data: {
        advisory_status: 'confirmed',
        delivery_date: date,
        ...(tf ? { delivery_time_from: tf } : {}),
        ...(tt ? { delivery_time_to: tt } : {}),
      },
    });

    await this.status.addEvent(adv.shipment_id, 'AVISIERT', {
      description: `Termin ${scheduledDate}${timeFrom && timeTo ? ` ${timeFrom}–${timeTo}` : ''}`,
      isAutomatic: false,
    });

    return updated;
  }

  async getAdvisoryWorkstack() {
    return this.prisma.advisories.findMany({
      where: { status: { in: ['open', 'contacted'] } },
      orderBy: [{ created_at: 'asc' }],
      include: ADVISORY_INCLUDE,
    });
  }

  async patchStatus(advisoryId: string, status: string) {
    const adv = await this.prisma.advisories.findUnique({
      where: { id: advisoryId },
    });
    if (!adv) throw new NotFoundException(`Avisierung ${advisoryId} nicht gefunden`);

    const updated = await this.prisma.advisories.update({
      where: { id: advisoryId },
      data: { status },
      include: ADVISORY_INCLUDE,
    });

    if (status === 'contacted') {
      await this.prisma.shipments.update({
        where: { id: adv.shipment_id },
        data: { advisory_status: 'contacted' },
      });
    }

    return updated;
  }

  sendAdvisoryEmailPlaceholder(advisoryId: string) {
    return {
      ok: true,
      advisoryId,
      message: 'E-Mail-Versand (Placeholder) – noch nicht angebunden.',
    };
  }
}
