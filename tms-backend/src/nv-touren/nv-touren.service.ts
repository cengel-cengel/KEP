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

  async eligibleShipments(filter: {
    datum: string;
    nv_tour_gebiet_id?: string;
    search?: string;
  }) {
    const datum = new Date(filter.datum);

    const tourGebiete = await this.prisma.nv_tour_gebiete.findMany({
      where: filter.nv_tour_gebiet_id
        ? { id: filter.nv_tour_gebiet_id, aktiv: true }
        : { aktiv: true },
      select: { id: true, code: true, name: true, plz_pattern: true },
    });

    type TG = { id: string; code: string; name: string; plzSet: Set<string> };
    const gebiete: TG[] = tourGebiete.map((g) => {
      const plz = Array.isArray(g.plz_pattern)
        ? (g.plz_pattern as unknown[]).filter(
            (x): x is string => typeof x === 'string',
          )
        : [];
      return {
        id: g.id,
        code: g.code,
        name: g.name,
        plzSet: new Set(plz),
      };
    });

    const allPlz = new Set<string>();
    for (const g of gebiete) for (const p of g.plzSet) allPlz.add(p);

    const stoppedShipmentIds = new Set(
      (
        await this.prisma.nv_tour_stops.findMany({
          select: { shipment_id: true },
        })
      ).map((s) => s.shipment_id),
    );

    const stammKunden = await this.prisma.nv_stamm_kunden.findMany({
      where: { aktiv: true },
      select: { customer_id: true },
    });
    const stammKundenIds = new Set(stammKunden.map((s) => s.customer_id));

    const where: any = {
      delivery_date: datum,
      deleted_at: null,
      id: { notIn: [...stoppedShipmentIds] },
    };
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
      orderBy: [{ delivery_date: 'asc' }, { created_at: 'asc' }],
      include: {
        customers: {
          select: { id: true, customer_number: true, name: true },
        },
        addresses_shipments_delivery_address_idToaddresses: {
          select: {
            id: true,
            street: true,
            zip: true,
            city: true,
            country_code: true,
          },
        },
      },
      take: 500,
    });

    return shipments
      .map((s) => {
        const delivery_address =
          s.addresses_shipments_delivery_address_idToaddresses;
        const zip = delivery_address?.zip ?? '';
        let matched_tour_gebiet_id: string | null = null;
        let matched_tour_gebiet_code: string | null = null;
        for (const g of gebiete) {
          if (zip && g.plzSet.has(zip)) {
            matched_tour_gebiet_id = g.id;
            matched_tour_gebiet_code = g.code;
            break;
          }
        }
        const {
          addresses_shipments_delivery_address_idToaddresses: _a,
          customers,
          ...rest
        } = s;
        return {
          ...rest,
          customer: customers,
          delivery_address,
          matched_tour_gebiet_id,
          matched_tour_gebiet_code,
          is_stamm_kunde:
            !!s.customer_id && stammKundenIds.has(s.customer_id),
        };
      })
      .filter((s) =>
        filter.nv_tour_gebiet_id
          ? s.matched_tour_gebiet_id === filter.nv_tour_gebiet_id
          : allPlz.size === 0 || s.matched_tour_gebiet_id !== null,
      );
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
