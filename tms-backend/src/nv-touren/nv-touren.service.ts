import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  async list(filter: { datum?: string; status?: string }) {
    const where: any = {};
    if (filter.datum) where.datum = new Date(filter.datum);
    if (filter.status) where.status = filter.status;
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
    await this.safeRecalc(id);
    return result;
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

    const created = await this.prisma.nv_tour_stops.create({
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
    await this.safeRecalc(tourId);
    return created;
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
      orderBy: [{ loading_date: 'asc' }, { created_at: 'asc' }],
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
          addresses_shipments_loading_address_idToaddresses: _b,
          customers,
          ...rest
        } = s;
        return {
          ...rest,
          customer: customers,
          delivery_address,
          loading_address,
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

  async autoSuggest(datum: string) {
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
    }[] = [];

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
      const result = await this.copyStammKunden(tour.id);
      stops_added_total += result.added ?? 0;
      details.push({
        tour_id: tour.id,
        code: st.code,
        created,
        stops_added: result.added ?? 0,
        stops_skipped: result.skipped ?? 0,
      });
    }

    return {
      touren_created,
      stops_added: stops_added_total,
      details,
    };
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
    await this.safeRecalc(tourId);
    return { added, skipped };
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
