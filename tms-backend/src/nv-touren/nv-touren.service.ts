import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNvTourDto } from './dto/create-nv-tour.dto';
import { UpdateNvTourDto } from './dto/update-nv-tour.dto';
import {
  CreateNvTourStopDto,
  ReorderItemDto,
  UpdateNvTourStopDto,
} from './dto/create-stop.dto';
import {
  computeVorlaufCosts,
  routingMinuten,
  sumZuschlaegeMin,
  type ShipmentRoutingKlasse,
  type VorlaufCostInput,
} from '../lib/vorlauf-costs.lib';

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
      nv_tour_gebiet: {
        select: {
          id: true,
          code: true,
          name: true,
          farbe: true,
          plz_pattern: true,
        },
      },
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
          package_count: true,
          weight_kg: true,
          volume_m3: true,
          ldm: true,
          addresses_shipments_loading_address_idToaddresses: {
            select: {
              id: true,
              street: true,
              zip: true,
              city: true,
              lat: true,
              lng: true,
            },
          },
          addresses_shipments_delivery_address_idToaddresses: {
            select: {
              id: true,
              street: true,
              zip: true,
              city: true,
              lat: true,
              lng: true,
            },
          },
        },
      },
    },
  },
};

@Injectable()
export class NvTourenService {
  private readonly logger = new Logger(NvTourenService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Wraps recalcVorlaufCosts ohne Mutation zu blockieren. */
  private async safeRecalc(tourId: string) {
    try {
      await this.recalcVorlaufCosts(tourId);
    } catch (err: any) {
      this.logger.warn(
        `recalcVorlaufCosts(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  async recalcVorlaufCosts(tourId: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      include: {
        stops: {
          include: {
            shipment: {
              select: {
                id: true,
                weight_kg: true,
                volume_m3: true,
                ldm: true,
              },
            },
          },
        },
      },
    });
    if (!tour) throw new NotFoundException('NV-Tour nicht gefunden');

    const tourTotalKostenEur = Number(tour.total_kosten_eur ?? 0);
    const tourGesamtStops = tour.stops.length;
    let tourGesamtMinuten = 0;
    let tourGesamtGewichtKg = 0;
    let tourGesamtVolumenM3 = 0;
    let tourGesamtLdm = 0;
    for (const s of tour.stops) {
      tourGesamtMinuten +=
        (s.servicezeit_min ?? 0) +
        sumZuschlaegeMin(s.service_zuschlaege) +
        routingMinuten(s.routing_klasse);
      tourGesamtGewichtKg += Number(s.shipment.weight_kg ?? 0);
      tourGesamtVolumenM3 += Number(s.shipment.volume_m3 ?? 0);
      tourGesamtLdm += Number(s.shipment.ldm ?? 0);
    }

    let created = 0;
    let updated = 0;
    for (const s of tour.stops) {
      const input: VorlaufCostInput = {
        tourTotalKostenEur,
        tourGesamtStops,
        tourGesamtMinuten,
        tourGesamtGewichtKg,
        tourGesamtVolumenM3,
        tourGesamtLdm,
        shipmentStops: 1,
        shipmentServicezeitMin: s.servicezeit_min ?? 0,
        shipmentServiceZuschlaegeMin: sumZuschlaegeMin(s.service_zuschlaege),
        shipmentRoutingZeitMin: routingMinuten(s.routing_klasse),
        shipmentRoutingKlasse:
          (s.routing_klasse as ShipmentRoutingKlasse) ?? 'STAMMROUTE',
        shipmentGewichtKg: Number(s.shipment.weight_kg ?? 0),
        shipmentVolumenM3: Number(s.shipment.volume_m3 ?? 0),
        shipmentLdm: Number(s.shipment.ldm ?? 0),
      };
      const breakdown = computeVorlaufCosts(input);

      const existing = await this.prisma.shipment_cost_components.findUnique({
        where: {
          shipment_id_phase_nv_tour_id: {
            shipment_id: s.shipment_id,
            phase: 'VORLAUF',
            nv_tour_id: tourId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.shipment_cost_components.update({
          where: { id: existing.id },
          data: {
            stop_anteil_eur: breakdown.stopAnteilEur,
            zeit_anteil_eur: breakdown.zeitAnteilEur,
            routing_anteil_eur: breakdown.routingAnteilEur,
            kapazitaet_anteil_eur: breakdown.kapazitaetAnteilEur,
            faktoren: breakdown.faktoren as any,
            tour_total_kosten_eur: tourTotalKostenEur,
            tour_gesamt_stops: tourGesamtStops,
            tour_gesamt_minuten: tourGesamtMinuten,
            computed_at: new Date(),
          },
        });
        updated++;
      } else {
        await this.prisma.shipment_cost_components.create({
          data: {
            shipment_id: s.shipment_id,
            nv_tour_id: tourId,
            phase: 'VORLAUF',
            stop_anteil_eur: breakdown.stopAnteilEur,
            zeit_anteil_eur: breakdown.zeitAnteilEur,
            routing_anteil_eur: breakdown.routingAnteilEur,
            kapazitaet_anteil_eur: breakdown.kapazitaetAnteilEur,
            faktoren: breakdown.faktoren as any,
            tour_total_kosten_eur: tourTotalKostenEur,
            tour_gesamt_stops: tourGesamtStops,
            tour_gesamt_minuten: tourGesamtMinuten,
          },
        });
        created++;
      }
    }
    return {
      shipments_processed: tourGesamtStops,
      components_created: created,
      components_updated: updated,
    };
  }

  private async augmentToursWithStammFlag<
    T extends {
      id: string;
      nv_stamm_tour_id: string | null;
      stops: { customer_id?: string | null; shipment?: { customer_id: string | null } | null }[];
    },
  >(tours: T[]): Promise<T[]> {
    const stammTourIds = [
      ...new Set(
        tours
          .map((t) => t.nv_stamm_tour_id)
          .filter((x): x is string => !!x),
      ),
    ];
    if (stammTourIds.length === 0) {
      return tours.map((t) => ({
        ...t,
        stops: t.stops.map((s) => ({ ...s, is_stamm_kunde: false })),
      })) as T[];
    }
    const stamm = await this.prisma.nv_stamm_kunden.findMany({
      where: {
        nv_stamm_tour_id: { in: stammTourIds },
        aktiv: true,
      },
      select: { nv_stamm_tour_id: true, customer_id: true },
    });
    const byStamm = new Map<string, Set<string>>();
    for (const s of stamm) {
      const set = byStamm.get(s.nv_stamm_tour_id) ?? new Set<string>();
      set.add(s.customer_id);
      byStamm.set(s.nv_stamm_tour_id, set);
    }
    return tours.map((t) => {
      const set = t.nv_stamm_tour_id
        ? byStamm.get(t.nv_stamm_tour_id) ?? null
        : null;
      return {
        ...t,
        stops: t.stops.map((s: any) => ({
          ...s,
          is_stamm_kunde:
            !!s.shipment?.customer_id &&
            !!set &&
            set.has(s.shipment.customer_id),
        })),
      } as T;
    });
  }

  async list(filter: { datum?: string; status?: string | string[] }) {
    const where: any = {};
    if (filter.datum) where.datum = new Date(filter.datum);
    const statusList = Array.isArray(filter.status)
      ? filter.status
      : filter.status
        ? [filter.status]
        : ['PLANNING'];
    where.status = { in: statusList };
    const rows = await this.prisma.nv_touren.findMany({
      where,
      orderBy: [{ datum: 'desc' }, { created_at: 'asc' }],
      include: TOUR_INCLUDE,
    });
    return this.augmentToursWithStammFlag(rows as any);
  }

  async getOne(id: string) {
    const t = await this.prisma.nv_touren.findUnique({
      where: { id },
      include: TOUR_INCLUDE,
    });
    if (!t) throw new NotFoundException('NV-Tour nicht gefunden');
    const [augmented] = await this.augmentToursWithStammFlag([t as any]);
    return augmented;
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

    const result = await this.prisma.nv_touren.update({
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
        kosten_modus: dto.kosten_modus ?? undefined,
        angefahrene_km:
          dto.angefahrene_km === undefined ? undefined : dto.angefahrene_km,
        stunden_geleistet:
          dto.stunden_geleistet === undefined
            ? undefined
            : dto.stunden_geleistet,
      },
      include: TOUR_INCLUDE,
    });
    if (dto.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      const openStops = await this.prisma.nv_tour_stops.findMany({
        where: {
          nv_tour_id: id,
          status: { in: ['PLANNED', 'ARRIVED'] },
        },
        select: {
          id: true,
          shipment_id: true,
          stop_type: true,
        },
      });
      for (const s of openStops) {
        await this.prisma.nv_tour_stops.update({
          where: { id: s.id },
          data: { status: 'COMPLETED' },
        });
        await this.completeStopShipment({
          shipment_id: s.shipment_id,
          stop_type: s.stop_type,
        });
      }
    }
    await this.safeRecalc(id);
    return result;
  }

  async remove(id: string) {
    const existing = await this.prisma.nv_touren.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('NV-Tour nicht gefunden');
    await this.prisma.nv_touren.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Wirft ConflictException 409 wenn das Hinzufuegen der
   * Sendung eine der 4 Kapazitaets-Achsen ueberschreitet.
   * Achsen mit max=null werden uebersprungen.
   */
  private async assertCapacityOk(tourId: string, shipmentId: string) {
    const cap = await this.getCapacity(tourId);
    const shipment = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: {
        package_count: true,
        weight_kg: true,
        volume_m3: true,
        ldm: true,
      },
    });
    if (!shipment) return;
    const add = {
      paletten: Number(shipment.package_count ?? 0),
      gewicht_kg: Number(shipment.weight_kg ?? 0),
      volumen_m3: Number(shipment.volume_m3 ?? 0),
      ldm: Number(shipment.ldm ?? 0),
    };
    const wouldExceed: {
      axis: string;
      max: number;
      current: number;
      adding: number;
      total: number;
    }[] = [];
    const checks: {
      axis: 'paletten' | 'gewicht_kg' | 'volumen_m3' | 'ldm';
      maxKey: 'max_paletten' | 'max_gewicht_kg' | 'max_volumen_m3' | 'max_ldm';
    }[] = [
      { axis: 'paletten', maxKey: 'max_paletten' },
      { axis: 'gewicht_kg', maxKey: 'max_gewicht_kg' },
      { axis: 'volumen_m3', maxKey: 'max_volumen_m3' },
      { axis: 'ldm', maxKey: 'max_ldm' },
    ];
    for (const c of checks) {
      const max = cap.limits[c.maxKey];
      if (max == null) continue;
      const cur = (cap.current as any)[c.axis] as number;
      const newTotal = cur + add[c.axis];
      if (newTotal > Number(max)) {
        wouldExceed.push({
          axis: c.axis,
          max: Number(max),
          current: cur,
          adding: add[c.axis],
          total: newTotal,
        });
      }
    }
    if (wouldExceed.length > 0) {
      throw new ConflictException({
        code: 'CAPACITY_EXCEEDED',
        limits: cap.limits,
        current: cap.current,
        free: cap.free,
        would_exceed: wouldExceed,
      });
    }
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

    await this.assertCapacityOk(tourId, dto.shipment_id);

    const created = await this.prisma.nv_tour_stops.create({
      data: {
        nv_tour_id: tourId,
        shipment_id: dto.shipment_id,
        position,
        stop_type: dto.stop_type ?? 'PICKUP',
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
    await this.safeRecalc(tourId);
    return created;
  }

  /**
   * Setzt shipment.status passend zum stop_type wenn ein
   * Stop COMPLETED wird (PICKUP→in_warehouse, DELIVERY→
   * delivered). FAILED ändert nichts.
   */
  private async completeStopShipment(stop: {
    shipment_id: string;
    stop_type: string;
  }) {
    const newStatus =
      stop.stop_type === 'DELIVERY' ? 'delivered' : 'in_warehouse';
    await this.prisma.shipments.update({
      where: { id: stop.shipment_id },
      data: { status: newStatus as any },
    });
  }

  async updateStop(stopId: string, dto: UpdateNvTourStopDto) {
    const existing = await this.prisma.nv_tour_stops.findUnique({
      where: { id: stopId },
    });
    if (!existing) throw new NotFoundException('Stop nicht gefunden');

    const result = await this.prisma.nv_tour_stops.update({
      where: { id: stopId },
      data: {
        position: dto.position ?? undefined,
        stop_type: dto.stop_type ?? undefined,
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
    if (
      dto.status === 'COMPLETED' &&
      existing.status !== 'COMPLETED'
    ) {
      await this.completeStopShipment({
        shipment_id: existing.shipment_id,
        stop_type: dto.stop_type ?? existing.stop_type,
      });
    }
    await this.safeRecalc(existing.nv_tour_id);
    return result;
  }

  async removeStop(stopId: string) {
    const existing = await this.prisma.nv_tour_stops.findUnique({
      where: { id: stopId },
    });
    if (!existing) throw new NotFoundException('Stop nicht gefunden');
    await this.prisma.nv_tour_stops.delete({ where: { id: stopId } });
    await this.safeRecalc(existing.nv_tour_id);
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
    await this.safeRecalc(tourId);
    return { count: items.length };
  }

  async eligibleShipments(filter: {
    datum: string;
    nv_tour_gebiet_id?: string;
    search?: string;
    mode?: 'PICKUP' | 'DELIVERY';
  }) {
    const datum = new Date(filter.datum);
    const mode = filter.mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';

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
          where: {
            stop_type: mode,
            status: { notIn: ['COMPLETED', 'FAILED'] },
            nv_tour: {
              status: { in: ['PLANNING', 'DISPATCHED', 'IN_PROGRESS'] },
            },
          },
          select: { shipment_id: true },
        })
      ).map((s) => s.shipment_id),
    );

    const stammKunden = await this.prisma.nv_stamm_kunden.findMany({
      where: { aktiv: true },
      select: { customer_id: true },
    });
    const stammKundenIds = new Set(stammKunden.map((s) => s.customer_id));

    const where: any =
      mode === 'DELIVERY'
        ? {
            status: 'in_warehouse',
            delivery_date: { lte: datum },
            deleted_at: null,
            id: { notIn: [...stoppedShipmentIds] },
          }
        : {
            status: 'new',
            loading_date: { lte: datum },
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
      orderBy:
        mode === 'DELIVERY'
          ? [{ delivery_date: 'asc' }, { created_at: 'asc' }]
          : [{ loading_date: 'asc' }, { created_at: 'asc' }],
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
            lat: true,
            lng: true,
          },
        },
        addresses_shipments_loading_address_idToaddresses: {
          select: {
            id: true,
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

    return shipments
      .map((s) => {
        const delivery_address =
          s.addresses_shipments_delivery_address_idToaddresses;
        const loading_address =
          s.addresses_shipments_loading_address_idToaddresses;
        const pin_address =
          mode === 'DELIVERY' ? delivery_address : loading_address;
        const zip = pin_address?.zip ?? '';
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
          addresses_shipments_loading_address_idToaddresses: _b,
          customers,
          ...rest
        } = s;
        return {
          ...rest,
          customer: customers,
          delivery_address,
          loading_address,
          pin_address,
          mode,
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

  async autoSuggest(datum: string, mode: 'PICKUP' | 'DELIVERY' = 'PICKUP') {
    if (!datum) {
      return {
        touren_created: 0,
        stops_added: 0,
        details: [],
        error: 'datum-missing',
      };
    }
    const tag = new Date(datum);
    const stammTouren = await this.prisma.nv_stamm_touren.findMany({
      where: { aktiv: true },
      select: {
        id: true,
        code: true,
        fahrzeug_typ: true,
        default_subunternehmer_id: true,
      },
    });

    let touren_created = 0;
    let stops_added_total = 0;
    const details: {
      tour_id: string;
      code: string;
      created: boolean;
      stops_added: number;
      stops_skipped: number;
      stops_skipped_capacity: number;
      stops_skipped_too_big: number;
      new_tours_created: number;
    }[] = [];
    let total_skipped_too_big = 0;
    let total_new_tours_created = 0;

    for (const st of stammTouren) {
      let tour = await this.prisma.nv_touren.findFirst({
        where: { nv_stamm_tour_id: st.id, datum: tag },
        select: { id: true },
      });
      let created = false;
      if (!tour) {
        const t = await this.prisma.nv_touren.create({
          data: {
            nv_stamm_tour_id: st.id,
            datum: tag,
            status: 'PLANNING',
            subunternehmer_id: st.default_subunternehmer_id ?? undefined,
            fahrzeug_typ: st.fahrzeug_typ ?? undefined,
          },
          select: { id: true },
        });
        tour = t;
        touren_created++;
        created = true;
      }
      const result = await this.copyStammKunden(tour.id, mode);
      stops_added_total += result.added ?? 0;
      total_skipped_too_big += result.skipped_too_big ?? 0;
      total_new_tours_created += result.new_tours_created ?? 0;
      details.push({
        tour_id: tour.id,
        code: st.code,
        created,
        stops_added: result.added ?? 0,
        stops_skipped: result.skipped ?? 0,
        stops_skipped_capacity: result.skipped_capacity ?? 0,
        stops_skipped_too_big: result.skipped_too_big ?? 0,
        new_tours_created: result.new_tours_created ?? 0,
      });
    }

    return {
      touren_created: touren_created + total_new_tours_created,
      touren_created_template: touren_created,
      new_tours_created: total_new_tours_created,
      stops_added: stops_added_total,
      stops_skipped_too_big: total_skipped_too_big,
      details,
    };
  }

  /**
   * Pruft ob eine Sendung ueberhaupt in eine LEERE Tour
   * mit der gegebenen Sub-Konfig passen wuerde.
   * Returns true wenn shipment passt; false wenn ein
   * shipment-Wert sub.max_* alleine schon ueberschreitet
   * (zu gross fuer Sub).
   */
  private async shipmentFitsInEmptyTour(
    shipmentId: string,
    sub: {
      max_paletten: number | null;
      max_gewicht_kg: any;
      max_volumen_m3: any;
      max_ldm: any;
    } | null,
  ): Promise<boolean> {
    if (!sub) return true;
    const ship = await this.prisma.shipments.findUnique({
      where: { id: shipmentId },
      select: {
        package_count: true,
        weight_kg: true,
        volume_m3: true,
        ldm: true,
      },
    });
    if (!ship) return true;
    const checks: { val: number; max: number | null }[] = [
      { val: Number(ship.package_count ?? 0), max: sub.max_paletten ?? null },
      {
        val: Number(ship.weight_kg ?? 0),
        max: sub.max_gewicht_kg != null ? Number(sub.max_gewicht_kg) : null,
      },
      {
        val: Number(ship.volume_m3 ?? 0),
        max: sub.max_volumen_m3 != null ? Number(sub.max_volumen_m3) : null,
      },
      {
        val: Number(ship.ldm ?? 0),
        max: sub.max_ldm != null ? Number(sub.max_ldm) : null,
      },
    ];
    for (const c of checks) {
      if (c.max != null && c.val > c.max) return false;
    }
    return true;
  }

  async copyStammKunden(
    tourId: string,
    mode: 'PICKUP' | 'DELIVERY' = 'PICKUP',
  ) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      select: {
        id: true,
        datum: true,
        nv_stamm_tour_id: true,
        subunternehmer_id: true,
        fahrzeug_typ: true,
      },
    });
    if (!tour) throw new NotFoundException('NV-Tour nicht gefunden');
    if (!tour.nv_stamm_tour_id) {
      return {
        added: 0,
        skipped: 0,
        skipped_capacity: 0,
        skipped_too_big: 0,
        new_tours_created: 0,
        reason: 'Tour ohne Stamm-Tour',
      };
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

    // Sub des Original-Tours fuer too_big-Checks und
    // Auto-Tour-Anlegen (gleicher Sub).
    const originalSubId = tour.subunternehmer_id ?? null;
    const subForChecks = originalSubId
      ? await this.prisma.nv_subunternehmer.findUnique({
          where: { id: originalSubId },
          select: {
            id: true,
            max_paletten: true,
            max_gewicht_kg: true,
            max_volumen_m3: true,
            max_ldm: true,
            tarif_typ: true,
            tarif_tagespauschale_eur: true,
            tarif_pro_stop_eur: true,
          },
        })
      : null;

    let currentTourId = tourId;
    let nextPos =
      (
        await this.prisma.nv_tour_stops.aggregate({
          where: { nv_tour_id: currentTourId },
          _max: { position: true },
        })
      )._max.position ?? -1;

    let added = 0;
    let skipped = 0;
    let skipped_capacity = 0;
    let skipped_too_big = 0;
    let new_tours_created = 0;

    const createNewTourSameTemplate = async (): Promise<string> => {
      const created = await this.prisma.nv_touren.create({
        data: {
          nv_stamm_tour_id: tour.nv_stamm_tour_id,
          datum: tour.datum,
          status: 'PLANNING',
          subunternehmer_id: tour.subunternehmer_id ?? undefined,
          fahrzeug_typ: tour.fahrzeug_typ ?? undefined,
          fahrer_kosten_eur:
            subForChecks?.tarif_typ === 'TAGESPAUSCHALE' &&
            subForChecks.tarif_tagespauschale_eur != null
              ? Number(subForChecks.tarif_tagespauschale_eur)
              : undefined,
          fahrzeug_kosten_eur: 90,
          kraftstoff_kosten_eur: 70,
          dispo_kosten_eur: 30,
          sonstige_kosten_eur: 10,
          kosten_modus: 'TARIF',
        },
        select: { id: true },
      });
      new_tours_created++;
      return created.id;
    };

    for (const sk of stammKunden) {
      const shipments = await this.prisma.shipments.findMany({
        where:
          mode === 'DELIVERY'
            ? {
                customer_id: sk.customer_id,
                status: 'in_warehouse',
                delivery_date: { lte: tour.datum },
                deleted_at: null,
              }
            : {
                customer_id: sk.customer_id,
                status: 'new',
                loading_date: { lte: tour.datum },
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
        // 1) Pre-Check: passt Sendung ueberhaupt in eine
        // leere Tour mit dieser Sub-Konfig?
        const fits = await this.shipmentFitsInEmptyTour(
          s.id,
          subForChecks,
        );
        if (!fits) {
          skipped_too_big++;
          continue;
        }
        // 2) Versuche aktuelle Tour, sonst neue Tour anlegen
        let placed = false;
        for (let attempt = 0; attempt < 2 && !placed; attempt++) {
          try {
            await this.assertCapacityOk(currentTourId, s.id);
            placed = true;
          } catch (err: any) {
            if (err instanceof ConflictException && attempt === 0) {
              currentTourId = await createNewTourSameTemplate();
              nextPos =
                (
                  await this.prisma.nv_tour_stops.aggregate({
                    where: { nv_tour_id: currentTourId },
                    _max: { position: true },
                  })
                )._max.position ?? -1;
              continue;
            }
            if (err instanceof ConflictException) {
              skipped_capacity++;
              break;
            }
            throw err;
          }
        }
        if (!placed) continue;
        nextPos++;
        try {
          await this.prisma.nv_tour_stops.create({
            data: {
              nv_tour_id: currentTourId,
              shipment_id: s.id,
              position: nextPos,
              stop_type: mode,
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
    // Recalc fuer alle moeglicherweise befuellten Touren
    await this.safeRecalc(tourId);
    if (currentTourId !== tourId) {
      await this.safeRecalc(currentTourId);
    }
    return {
      added,
      skipped,
      skipped_capacity,
      skipped_too_big,
      new_tours_created,
    };
  }

  async getCostComponentsByTour(tourId: string) {
    return this.prisma.shipment_cost_components.findMany({
      where: { nv_tour_id: tourId, phase: 'VORLAUF' },
      include: {
        shipment: {
          select: {
            id: true,
            shipment_number: true,
            customers: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { computed_at: 'desc' },
    });
  }

  async getCapacity(tourId: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      include: {
        subunternehmer: {
          select: {
            id: true,
            name: true,
            max_paletten: true,
            max_gewicht_kg: true,
            max_volumen_m3: true,
            max_ldm: true,
          },
        },
        stops: {
          include: {
            shipment: {
              select: {
                package_count: true,
                weight_kg: true,
                volume_m3: true,
                ldm: true,
              },
            },
          },
        },
      },
    });
    if (!tour) throw new NotFoundException('NV-Tour nicht gefunden');

    let cur_paletten = 0;
    let cur_gewicht_kg = 0;
    let cur_volumen_m3 = 0;
    let cur_ldm = 0;
    for (const s of tour.stops) {
      cur_paletten += Number(s.shipment.package_count ?? 0);
      cur_gewicht_kg += Number(s.shipment.weight_kg ?? 0);
      cur_volumen_m3 += Number(s.shipment.volume_m3 ?? 0);
      cur_ldm += Number(s.shipment.ldm ?? 0);
    }

    const sub = tour.subunternehmer;
    const max_paletten = sub?.max_paletten ?? null;
    const max_gewicht_kg = sub?.max_gewicht_kg ?? null;
    const max_volumen_m3 =
      sub?.max_volumen_m3 != null ? Number(sub.max_volumen_m3) : null;
    const max_ldm = sub?.max_ldm != null ? Number(sub.max_ldm) : null;

    return {
      tour_id: tourId,
      subunternehmer_id: sub?.id ?? null,
      subunternehmer_name: sub?.name ?? null,
      limits: {
        max_paletten,
        max_gewicht_kg,
        max_volumen_m3,
        max_ldm,
      },
      current: {
        paletten: cur_paletten,
        gewicht_kg: cur_gewicht_kg,
        volumen_m3: Math.round(cur_volumen_m3 * 1000) / 1000,
        ldm: Math.round(cur_ldm * 100) / 100,
      },
      free: {
        paletten:
          max_paletten != null ? max_paletten - cur_paletten : null,
        gewicht_kg:
          max_gewicht_kg != null ? max_gewicht_kg - cur_gewicht_kg : null,
        volumen_m3:
          max_volumen_m3 != null
            ? Math.round((max_volumen_m3 - cur_volumen_m3) * 1000) / 1000
            : null,
        ldm:
          max_ldm != null
            ? Math.round((max_ldm - cur_ldm) * 100) / 100
            : null,
      },
    };
  }

  async getCostComponentsByShipment(shipmentId: string) {
    return this.prisma.shipment_cost_components.findMany({
      where: { shipment_id: shipmentId },
      include: {
        nv_tour: {
          select: {
            id: true,
            datum: true,
            nv_stamm_tour: { select: { id: true, code: true } },
          },
        },
      },
      orderBy: { computed_at: 'desc' },
    });
  }
}
