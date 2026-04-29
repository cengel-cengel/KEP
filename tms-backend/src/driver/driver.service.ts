import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { StatusService } from '../status/status.service';
import { LockService } from '../status/lock.service';
import type { DeliverShipmentDto } from './dto/deliver-shipment.dto';
import type { ReportProblemDto } from './dto/report-problem.dto';
import type { DriverJwtPayload } from './driver-auth.guard';
import { ReturnsService } from '../returns/returns.service';

function fmtTime(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return d.toISOString().slice(11, 16);
  } catch {
    return null;
  }
}

function addressView(a: {
  name: string;
  street: string;
  zip: string;
  city: string;
  country_code: string;
}) {
  return {
    name: a.name,
    street: a.street,
    zip: a.zip,
    city: a.city,
    country_code: a.country_code,
  };
}

@Injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly status: StatusService,
    private readonly locks: LockService,
    private readonly returns: ReturnsService,
  ) {}

  private async signDriverToken(tourId: string): Promise<string> {
    const payload: DriverJwtPayload = { tourId, type: 'driver' };
    return this.jwt.signAsync(payload, { expiresIn: '24h' });
  }

  async loginWithToken(accessToken: string) {
    const now = new Date();
    const tour = await this.prisma.tours.findFirst({
      where: {
        driver_access_token: accessToken,
        driver_token_expires_at: { gt: now },
      },
      select: { id: true },
    });
    if (!tour) {
      throw new UnauthorizedException('Token ungültig oder abgelaufen');
    }
    const token = await this.signDriverToken(tour.id);
    return { token, tourId: tour.id };
  }

  async loginWithPin(pin: string) {
    const now = new Date();
    const tour = await this.prisma.tours.findFirst({
      where: {
        driver_pin: pin,
        driver_pin_expires_at: { gt: now },
      },
      select: { id: true },
    });
    if (!tour) {
      throw new UnauthorizedException('PIN ungültig oder abgelaufen');
    }
    const token = await this.signDriverToken(tour.id);
    return { token, tourId: tour.id };
  }

  private async allShipmentsResolved(tourId: string): Promise<boolean> {
    const list = await this.prisma.shipments.findMany({
      where: { tour_id: tourId, deleted_at: null },
      select: {
        id: true,
        _count: {
          select: {
            driver_deliveries: true,
            driver_problems: true,
          },
        },
      },
    });
    if (!list.length) return false;
    return list.every(
      (s) =>
        s._count.driver_deliveries > 0 || s._count.driver_problems > 0,
    );
  }

  private async maybeCompleteTour(tourId: string) {
    if (await this.allShipmentsResolved(tourId)) {
      const now = new Date();
      await this.prisma.tours.update({
        where: { id: tourId },
        data: { status: 'completed', completed_at: now },
      });
    }
  }

  async getTourForDriver(tourId: string) {
    const tour = await this.prisma.tours.findFirst({
      where: { id: tourId },
      include: {
        shipments: {
          where: { deleted_at: null },
          orderBy: { tour_position: 'asc' },
          include: {
            addresses_shipments_loading_address_idToaddresses: true,
            addresses_shipments_delivery_address_idToaddresses: true,
            driver_deliveries: { orderBy: { delivered_at: 'desc' }, take: 1 },
            driver_problems: { orderBy: { reported_at: 'desc' }, take: 3 },
          },
        },
      },
    });

    if (!tour) throw new NotFoundException('Tour nicht gefunden');

    const shipments = tour.shipments.map((s) => {
      const load = s.addresses_shipments_loading_address_idToaddresses;
      const del = s.addresses_shipments_delivery_address_idToaddresses;
      const isDelivered = s.driver_deliveries.length > 0;
      const hasProblem = s.driver_problems.length > 0;
      const isDone = isDelivered || hasProblem;
      const deliveredAt = s.driver_deliveries[0]?.delivered_at ?? null;

      return {
        id: s.id,
        shipment_number: s.shipment_number,
        tour_position: s.tour_position,
        package_count: s.package_count,
        package_type: s.package_type,
        weight_kg: Number(s.weight_kg),
        customer_note: s.customer_note,
        delivery_time_from: fmtTime(s.delivery_time_from),
        delivery_time_to: fmtTime(s.delivery_time_to),
        loading_address: load ? addressView(load) : null,
        delivery_address: del ? addressView(del) : null,
        isDelivered,
        hasProblem,
        isDone,
        deliveredAt,
      };
    });

    const done = shipments.filter((s) => s.isDone).length;
    const total = shipments.length;
    const next = shipments.find((s) => !s.isDone);

    return {
      tour: {
        id: tour.id,
        tour_number: tour.tour_number,
        tour_date: tour.tour_date,
        status: tour.status,
      },
      shipments,
      progress: { done, total },
      nextShipmentId: next?.id ?? null,
    };
  }

  private async assertShipmentOnTour(shipmentId: string, tourId: string) {
    const s = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, tour_id: tourId, deleted_at: null },
      select: {
        id: true,
        _count: {
          select: { driver_deliveries: true, driver_problems: true },
        },
      },
    });
    if (!s) {
      throw new NotFoundException('Sendung nicht auf dieser Tour');
    }
    return s;
  }

  async deliverShipment(
    tourId: string,
    shipmentId: string,
    dto: DeliverShipmentDto,
  ) {
    const s = await this.assertShipmentOnTour(shipmentId, tourId);
    if (s._count.driver_deliveries > 0 || s._count.driver_problems > 0) {
      throw new BadRequestException('Stopp bereits erledigt');
    }

    const deliveredAt = new Date(dto.delivered_at);

    await this.prisma.driver_deliveries.create({
      data: {
        shipment_id: shipmentId,
        tour_id: tourId,
        recipient_name: dto.recipientName.trim(),
        signature_base64: dto.signature_base64,
        photo_base64: dto.photo_base64 ?? null,
        delivered_at: deliveredAt,
        notes: dto.notes ?? null,
      },
    });

    await this.status.addEvent(shipmentId, 'ZUGESTELLT', {
      recipientName: dto.recipientName.trim(),
      signatureData: dto.signature_base64,
      photoUrl: dto.photo_base64 ?? undefined,
      description: dto.notes ?? undefined,
      isAutomatic: false,
    });

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: { delivered_at: deliveredAt },
    });

    await this.maybeCompleteTour(tourId);

    const fresh = await this.getTourForDriver(tourId);
    const allDone = fresh.progress.total > 0 && fresh.progress.done >= fresh.progress.total;

    return {
      success: true,
      nextShipmentId: fresh.nextShipmentId,
      allDone,
    };
  }

  async reportProblem(
    tourId: string,
    shipmentId: string,
    dto: ReportProblemDto,
  ) {
    const s = await this.assertShipmentOnTour(shipmentId, tourId);
    if (s._count.driver_deliveries > 0 || s._count.driver_problems > 0) {
      throw new BadRequestException('Stopp bereits erledigt');
    }

    await this.prisma.driver_problems.create({
      data: {
        shipment_id: shipmentId,
        tour_id: tourId,
        problem_type: dto.problem_type,
        notes: dto.notes ?? null,
        photo_base64: dto.photo_base64 ?? null,
      },
    });

    await this.returns.createNvDisposition(
      shipmentId,
      {
        shipmentId,
        problemType: dto.problem_type,
        driverNotes: dto.notes,
        driverPhotoBase64: dto.photo_base64,
        requiresAdvisory: false,
      } as any,
      null,
    );

    if (dto.problem_type === 'BESCHAEDIGT') {
      await this.returns.createDamageReport(
        shipmentId,
        {
          shipmentId,
          damageType: 'OPTISCH',
          damageDescription: dto.notes ?? 'Schaden gemeldet (Fahrer)',
          photoBase64_1: dto.photo_base64,
          reportedByDriver: true,
        } as any,
        null,
      );
    }

    await this.maybeCompleteTour(tourId);

    const fresh = await this.getTourForDriver(tourId);
    const allDone = fresh.progress.total > 0 && fresh.progress.done >= fresh.progress.total;

    return {
      success: true,
      nextShipmentId: fresh.nextShipmentId,
      allDone,
    };
  }

  async completeTour(tourId: string) {
    await this.prisma.tours.update({
      where: { id: tourId },
      data: {
        status: 'completed',
        completed_at: new Date(),
      },
    });
    return { success: true };
  }
}
