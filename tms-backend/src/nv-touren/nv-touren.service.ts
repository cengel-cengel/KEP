import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNvTourDto } from './dto/create-nv-tour.dto';
import { UpdateNvTourDto } from './dto/update-nv-tour.dto';
import {
  CreateNvTourStopDto,
  ReorderItemDto,
  UpdateNvTourStopDto,
} from './dto/create-stop.dto';

function timeToDate(hhmm?: string | null): Date | null | undefined {
  if (hhmm === undefined) return undefined;
  if (hhmm === null) return null;
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

const TOUR_INCLUDE = {
  nv_stamm_tour: {
    select: {
      id: true,
      code: true,
      name: true,
      nv_tour_gebiet: { select: { id: true, code: true, name: true } },
    },
  },
  subunternehmer: {
    select: {
      id: true,
      name: true,
      business_partner: {
        select: { id: true, partner_number: true, name: true },
      },
    },
  },
  stops: {
    orderBy: [{ position: 'asc' as const }, { created_at: 'asc' as const }],
    include: {
      shipment: {
        select: {
          id: true,
          shipment_number: true,
          customer_id: true,
          loading_date: true,
          delivery_date: true,
        },
      },
    },
  },
};

@Injectable()
export class NvTourenService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { datum?: string; status?: string }) {
    const where: any = {};
    if (filter.datum) where.datum = new Date(filter.datum);
    if (filter.status) where.status = filter.status;
    return this.prisma.nv_touren.findMany({
      where,
      orderBy: [{ datum: 'desc' }, { created_at: 'asc' }],
      include: TOUR_INCLUDE,
    });
  }

  async getOne(id: string) {
    const t = await this.prisma.nv_touren.findUnique({
      where: { id },
      include: TOUR_INCLUDE,
    });
    if (!t) throw new NotFoundException('NV-Tour nicht gefunden');
    return t;
  }

  async create(dto: CreateNvTourDto) {
    const stamm = await this.prisma.nv_stamm_touren.findUnique({
      where: { id: dto.nv_stamm_tour_id },
      select: { id: true, fahrzeug_typ: true, default_subunternehmer_id: true },
    });
    if (!stamm) throw new NotFoundException('Stamm-Tour nicht gefunden');

    return this.prisma.nv_touren.create({
      data: {
        nv_stamm_tour_id: stamm.id,
        datum: new Date(dto.datum),
        status: dto.status ?? 'PLANNING',
        subunternehmer_id:
          dto.subunternehmer_id ?? stamm.default_subunternehmer_id ?? undefined,
        fahrzeug_typ: dto.fahrzeug_typ ?? stamm.fahrzeug_typ ?? undefined,
        notizen: dto.notizen ?? undefined,
      },
      include: TOUR_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateNvTourDto) {
    const existing = await this.prisma.nv_touren.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('NV-Tour nicht gefunden');

    return this.prisma.nv_touren.update({
      where: { id },
      data: {
        nv_stamm_tour_id:
          dto.nv_stamm_tour_id === undefined
            ? undefined
            : dto.nv_stamm_tour_id,
        datum: dto.datum ? new Date(dto.datum) : undefined,
        status: dto.status ?? undefined,
        subunternehmer_id:
          dto.subunternehmer_id === undefined
            ? undefined
            : dto.subunternehmer_id,
        start_zeit:
          dto.start_zeit === undefined ? undefined : timeToDate(dto.start_zeit),
        end_zeit:
          dto.end_zeit === undefined ? undefined : timeToDate(dto.end_zeit),
        fahrzeug_typ:
          dto.fahrzeug_typ === undefined ? undefined : dto.fahrzeug_typ,
        notizen: dto.notizen === undefined ? undefined : dto.notizen,
        fahrer_kosten_eur:
          dto.fahrer_kosten_eur === undefined
            ? undefined
            : dto.fahrer_kosten_eur,
        fahrzeug_kosten_eur:
          dto.fahrzeug_kosten_eur === undefined
            ? undefined
            : dto.fahrzeug_kosten_eur,
        kraftstoff_kosten_eur:
          dto.kraftstoff_kosten_eur === undefined
            ? undefined
            : dto.kraftstoff_kosten_eur,
        dispo_kosten_eur:
          dto.dispo_kosten_eur === undefined
            ? undefined
            : dto.dispo_kosten_eur,
        sonstige_kosten_eur:
          dto.sonstige_kosten_eur === undefined
            ? undefined
            : dto.sonstige_kosten_eur,
      },
      include: TOUR_INCLUDE,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.nv_touren.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('NV-Tour nicht gefunden');
    await this.prisma.nv_touren.delete({ where: { id } });
    return { ok: true };
  }

  async createStop(tourId: string, dto: CreateNvTourStopDto) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      select: { id: true, nv_stamm_tour_id: true },
    });
    if (!tour) throw new NotFoundException('NV-Tour nicht gefunden');

    const shipment = await this.prisma.shipments.findUnique({
      where: { id: dto.shipment_id },
      select: { id: true, customer_id: true },
    });
    if (!shipment) throw new NotFoundException('Shipment nicht gefunden');

    let servicezeit = dto.servicezeit_min ?? null;
    let routing = dto.routing_klasse ?? null;
    if (
      (servicezeit === null || routing === null) &&
      tour.nv_stamm_tour_id &&
      shipment.customer_id
    ) {
      const stamm = await this.prisma.nv_stamm_kunden.findFirst({
        where: {
          nv_stamm_tour_id: tour.nv_stamm_tour_id,
          customer_id: shipment.customer_id,
        },
        select: {
          standard_servicezeit_min: true,
          routing_klasse: true,
        },
      });
      if (stamm) {
        if (servicezeit === null)
          servicezeit = stamm.standard_servicezeit_min;
        if (routing === null) routing = stamm.routing_klasse;
      }
    }

    const position =
      dto.position ??
      (((
        await this.prisma.nv_tour_stops.aggregate({
          where: { nv_tour_id: tourId },
          _max: { position: true },
        })
      )._max.position ?? -1) +
        1);

    return this.prisma.nv_tour_stops.create({
      data: {
        nv_tour_id: tourId,
        shipment_id: dto.shipment_id,
        position,
        servicezeit_min: servicezeit ?? undefined,
        routing_klasse: routing ?? undefined,
        service_zuschlaege:
          dto.service_zuschlaege && dto.service_zuschlaege.length > 0
            ? dto.service_zuschlaege
            : undefined,
      },
      include: {
        shipment: {
          select: {
            id: true,
            shipment_number: true,
            customer_id: true,
          },
        },
      },
    });
  }

  async updateStop(stopId: string, dto: UpdateNvTourStopDto) {
    const existing = await this.prisma.nv_tour_stops.findUnique({
      where: { id: stopId },
    });
    if (!existing) throw new NotFoundException('Stop nicht gefunden');

    return this.prisma.nv_tour_stops.update({
      where: { id: stopId },
      data: {
        position: dto.position ?? undefined,
        status: dto.status ?? undefined,
        servicezeit_min:
          dto.servicezeit_min === undefined
            ? undefined
            : dto.servicezeit_min,
        routing_klasse:
          dto.routing_klasse === undefined ? undefined : dto.routing_klasse,
        service_zuschlaege:
          dto.service_zuschlaege === undefined
            ? undefined
            : dto.service_zuschlaege,
        ankunft_zeit:
          dto.ankunft_zeit === undefined
            ? undefined
            : dto.ankunft_zeit
              ? new Date(dto.ankunft_zeit)
              : null,
        abfahrt_zeit:
          dto.abfahrt_zeit === undefined
            ? undefined
            : dto.abfahrt_zeit
              ? new Date(dto.abfahrt_zeit)
              : null,
        notizen: dto.notizen === undefined ? undefined : dto.notizen,
      },
    });
  }

  async removeStop(stopId: string) {
    const existing = await this.prisma.nv_tour_stops.findUnique({
      where: { id: stopId },
    });
    if (!existing) throw new NotFoundException('Stop nicht gefunden');
    await this.prisma.nv_tour_stops.delete({ where: { id: stopId } });
    return { ok: true };
  }

  async reorderStops(tourId: string, items: ReorderItemDto[]) {
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.nv_tour_stops.update({
          where: { id: it.id },
          data: { position: it.position },
        }),
      ),
    );
    return { count: items.length };
  }

  async copyStammKunden(tourId: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      select: {
        id: true,
        datum: true,
        nv_stamm_tour_id: true,
      },
    });
    if (!tour) throw new NotFoundException('NV-Tour nicht gefunden');
    if (!tour.nv_stamm_tour_id) {
      return { added: 0, skipped: 0, reason: 'Tour ohne Stamm-Tour' };
    }

    const stammKunden = await this.prisma.nv_stamm_kunden.findMany({
      where: {
        nv_stamm_tour_id: tour.nv_stamm_tour_id,
        aktiv: true,
      },
      orderBy: { standard_position: 'asc' },
    });

    const existingShipmentIds = new Set(
      (
        await this.prisma.nv_tour_stops.findMany({
          where: { nv_tour_id: tourId },
          select: { shipment_id: true },
        })
      ).map((s) => s.shipment_id),
    );

    let nextPos =
      (
        await this.prisma.nv_tour_stops.aggregate({
          where: { nv_tour_id: tourId },
          _max: { position: true },
        })
      )._max.position ?? -1;

    let added = 0;
    let skipped = 0;
    for (const sk of stammKunden) {
      const shipments = await this.prisma.shipments.findMany({
        where: {
          customer_id: sk.customer_id,
          delivery_date: tour.datum,
          deleted_at: null,
        },
        select: { id: true },
      });
      if (shipments.length === 0) {
        skipped++;
        continue;
      }
      for (const s of shipments) {
        if (existingShipmentIds.has(s.id)) {
          skipped++;
          continue;
        }
        nextPos++;
        try {
          await this.prisma.nv_tour_stops.create({
            data: {
              nv_tour_id: tourId,
              shipment_id: s.id,
              position: nextPos,
              servicezeit_min: sk.standard_servicezeit_min ?? undefined,
              routing_klasse: sk.routing_klasse ?? undefined,
            },
          });
          existingShipmentIds.add(s.id);
          added++;
        } catch {
          skipped++;
        }
      }
    }
    return { added, skipped };
  }
}
