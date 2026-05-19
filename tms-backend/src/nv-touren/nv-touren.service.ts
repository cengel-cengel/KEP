import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
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
import { routeDistanceKm, routeOnly, routeTrip } from '../lib/osrm.lib';
import {
  getNvPlzSet,
  plzMatchesNv,
  type NvPlzSet,
} from '../lib/nv-plz.lib';
import { computeOverload, formatOverloadMessage } from '../lib/capacity.lib';

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
      max_ldm: true,
      max_gewicht_kg: true,
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
          length_cm: true,
          width_cm: true,
          height_cm: true,
          effective_pallets: true,
          freight_revenue: true,
          addresses_shipments_loading_address_idToaddresses: {
            select: {
              id: true,
              name: true,
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
              name: true,
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

  /** Wraps recalcTourKm ohne Mutation zu blockieren. */
  private async safeRecalcKm(tourId: string) {
    try {
      await this.recalcTourKm(tourId);
    } catch (err: any) {
      this.logger.warn(
        `recalcTourKm(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * B-4: Aggregat aus tour.stops.shipment + sub.max_* → Overload.
   * 2-Achsen (ldm + gewicht_kg). null wenn Tour nicht existiert.
   */
  private async computeNvTourOverload(tourId: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      include: {
        subunternehmer: {
          select: { max_ldm: true, max_gewicht_kg: true },
        },
        stops: {
          select: {
            shipment: {
              select: { ldm: true, weight_kg: true },
            },
          },
        },
      },
    });
    if (!tour) return null;
    let totalLdm = 0;
    let totalKg = 0;
    for (const s of tour.stops) {
      totalLdm += Number(s.shipment.ldm ?? 0);
      totalKg += Number(s.shipment.weight_kg ?? 0);
    }
    const sub = tour.subunternehmer;
    return computeOverload(
      totalLdm,
      totalKg,
      sub?.max_ldm != null ? Number(sub.max_ldm) : null,
      sub?.max_gewicht_kg != null ? Number(sub.max_gewicht_kg) : null,
    );
  }

  /** B-4: Pre-Check für status→DISPATCHED. Throwt 409 bei Overload. */
  private async assertReadyForDispatchNv(tourId: string) {
    const o = await this.computeNvTourOverload(tourId);
    if (o && o.isOverloaded) {
      throw new ConflictException({
        code: 'CAPACITY_EXCEEDED',
        message: formatOverloadMessage(o),
        overload: o,
      });
    }
  }

  /** Wraps optimizeTourRoute ohne Mutation zu blockieren. */
  private async safeOptimizeTour(tourId: string) {
    try {
      await this.optimizeTourRoute(tourId);
    } catch (err: any) {
      this.logger.warn(
        `optimizeTourRoute(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  /** Wraps routeOnlyForTour. Background-Pfad nach manual reorder. */
  private async safeRouteOnly(tourId: string) {
    try {
      await this.routeOnlyForTour(tourId);
    } catch (err: any) {
      this.logger.warn(
        `routeOnlyForTour(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Berechnet Polyline für USER-Order (kein TSP-Reorder).
   * Persistiert polyline_geometry + geplante_km. Aufruf NACH
   * manual reorderStops via setImmediate.
   */
  async routeOnlyForTour(tourId: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      include: TOUR_INCLUDE,
    });
    if (!tour) {
      this.logger.warn(`routeOnlyForTour(${tourId}): tour nicht gefunden`);
      return null;
    }

    const wh = await this.prisma.warehouses.findFirst({
      where: { is_default: true, active: true },
    });
    if (!wh || wh.lat == null || wh.lng == null) {
      this.logger.warn(
        `routeOnlyForTour(${tourId}): default warehouse missing — skip`,
      );
      return null;
    }
    const whLat = Number(wh.lat);
    const whLng = Number(wh.lng);
    if (!Number.isFinite(whLat) || !Number.isFinite(whLng)) return null;

    const sortedStops = [...tour.stops].sort((a, b) => a.position - b.position);
    const stopCoords: Array<[number, number]> = [];
    for (const s of sortedStops) {
      const sh: any = s.shipment;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh?.addresses_shipments_delivery_address_idToaddresses
          : sh?.addresses_shipments_loading_address_idToaddresses;
      if (!addr || addr.lat == null || addr.lng == null) continue;
      const lat = Number(addr.lat);
      const lng = Number(addr.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stopCoords.push([lng, lat]);
    }
    if (stopCoords.length === 0) {
      this.logger.warn(
        `routeOnlyForTour(${tourId}): no stop coords — skip`,
      );
      return null;
    }

    const coords: Array<[number, number]> = [
      [whLng, whLat],
      ...stopCoords,
      [whLng, whLat],
    ];
    const result = await routeOnly(coords);
    if (!result) {
      this.logger.warn(
        `routeOnlyForTour(${tourId}): OSRM returned null — polyline bleibt JsonNull`,
      );
      return null;
    }
    await this.prisma.nv_touren.update({
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

  /** Delegiert an lib/nv-plz.lib (gemeinsam mit tours.service). */
  private async getOwnNvPlzSet(): Promise<NvPlzSet> {
    return getNvPlzSet(this.prisma as any);
  }

  async optimizeTourRoute(tourId: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      include: TOUR_INCLUDE,
    });
    if (!tour) throw new NotFoundException('NV-Tour nicht gefunden');

    const wh = await this.prisma.warehouses.findFirst({
      where: { is_default: true, active: true },
    });
    if (!wh || wh.lat == null || wh.lng == null) {
      this.logger.warn(
        `optimizeTourRoute(${tourId}): default warehouse missing lat/lng — skip`,
      );
      return null;
    }
    const whLat = Number(wh.lat);
    const whLng = Number(wh.lng);
    if (!Number.isFinite(whLat) || !Number.isFinite(whLng)) {
      this.logger.warn(
        `optimizeTourRoute(${tourId}): warehouse coords NaN — skip`,
      );
      return null;
    }

    const sortedStops = [...tour.stops].sort(
      (a, b) => a.position - b.position,
    );
    const stopsWithCoords: Array<{ id: string; coord: [number, number] }> = [];
    let anyMissing = false;
    for (const s of sortedStops) {
      const sh: any = s.shipment;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh?.addresses_shipments_delivery_address_idToaddresses
          : sh?.addresses_shipments_loading_address_idToaddresses;
      if (!addr || addr.lat == null || addr.lng == null) {
        anyMissing = true;
        continue;
      }
      const lat = Number(addr.lat);
      const lng = Number(addr.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        anyMissing = true;
        continue;
      }
      stopsWithCoords.push({ id: s.id, coord: [lng, lat] });
    }

    if (stopsWithCoords.length === 0) {
      this.logger.warn(
        `optimizeTourRoute(${tourId}): no stops with coords — fallback recalcTourKm`,
      );
      return this.recalcTourKm(tourId);
    }
    if (anyMissing) {
      this.logger.warn(
        `optimizeTourRoute(${tourId}): some stops without coords — skip reorder, only recalc KM`,
      );
      return this.recalcTourKm(tourId);
    }
    if (stopsWithCoords.length === 1) {
      // Trip-API braucht ≥2 Coords zwischen Lager-Pinnings; mit 1 Stop
      // ist Sequenz trivial (WH→Stop→WH). Nur KM neu berechnen.
      return this.recalcTourKm(tourId);
    }

    const coords: Array<[number, number]> = [
      [whLng, whLat],
      ...stopsWithCoords.map((s) => s.coord),
      [whLng, whLat],
    ];
    const result = await routeTrip(coords);
    if (!result) {
      this.logger.warn(
        `optimizeTourRoute(${tourId}): OSRM trip returned null — fallback recalcTourKm`,
      );
      return this.recalcTourKm(tourId);
    }

    // optimizedOrder[optPos] = inputIdx (0..coords.length-1).
    // Index 0 und last sind Lager → herausfiltern, mittlere mappen
    // auf stop-Indizes via -1.
    const newOrderStopIds: string[] = [];
    const lastIdx = coords.length - 1;
    for (const inputIdx of result.optimizedOrder) {
      if (inputIdx === 0 || inputIdx === lastIdx) continue;
      const stopIdx = inputIdx - 1;
      if (stopIdx >= 0 && stopIdx < stopsWithCoords.length) {
        newOrderStopIds.push(stopsWithCoords[stopIdx].id);
      }
    }
    if (newOrderStopIds.length !== stopsWithCoords.length) {
      this.logger.warn(
        `optimizeTourRoute(${tourId}): order mismatch (${newOrderStopIds.length}/${stopsWithCoords.length}) — fallback recalcTourKm`,
      );
      return this.recalcTourKm(tourId);
    }

    // Reorder + KM in einer Transaktion
    // (DEFERRABLE Position-Constraint erlaubt batch-Update).
    await this.prisma.$transaction([
      ...newOrderStopIds.map((stopId, i) =>
        this.prisma.nv_tour_stops.update({
          where: { id: stopId },
          data: { position: i + 1 },
        }),
      ),
      this.prisma.nv_touren.update({
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

  async recalcTourKm(tourId: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      include: TOUR_INCLUDE,
    });
    if (!tour) throw new NotFoundException('NV-Tour nicht gefunden');

    const wh = await this.prisma.warehouses.findFirst({
      where: { is_default: true, active: true },
    });
    if (!wh || wh.lat == null || wh.lng == null) {
      this.logger.warn(
        `recalcTourKm(${tourId}): default warehouse missing lat/lng — skip`,
      );
      return null;
    }
    const whLat = Number(wh.lat);
    const whLng = Number(wh.lng);
    if (!Number.isFinite(whLat) || !Number.isFinite(whLng)) {
      this.logger.warn(`recalcTourKm(${tourId}): warehouse coords NaN — skip`);
      return null;
    }

    const stopCoords: Array<[number, number]> = [];
    for (const s of tour.stops) {
      const sh: any = s.shipment;
      const addr =
        s.stop_type === 'DELIVERY'
          ? sh?.addresses_shipments_delivery_address_idToaddresses
          : sh?.addresses_shipments_loading_address_idToaddresses;
      if (!addr || addr.lat == null || addr.lng == null) continue;
      const lat = Number(addr.lat);
      const lng = Number(addr.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stopCoords.push([lng, lat]);
    }
    if (stopCoords.length === 0) {
      this.logger.warn(
        `recalcTourKm(${tourId}): no stops with coords — clearing`,
      );
      await this.prisma.nv_touren.update({
        where: { id: tourId },
        data: { geplante_km: null, km_calculated_at: new Date() },
      });
      return null;
    }

    const coords: Array<[number, number]> = [
      [whLng, whLat],
      ...stopCoords,
      [whLng, whLat],
    ];
    const km = await routeDistanceKm(coords);
    if (km == null) {
      this.logger.warn(`recalcTourKm(${tourId}): OSRM returned null`);
      return null;
    }
    await this.prisma.nv_touren.update({
      where: { id: tourId },
      data: {
        geplante_km: km.toFixed(2),
        km_calculated_at: new Date(),
      },
    });
    return km;
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
      // B-4: Overload on-the-fly aus TOUR_INCLUDE (stops + sub).
      let totalLdm = 0;
      let totalKg = 0;
      for (const s of t.stops as any[]) {
        totalLdm += Number(s.shipment?.ldm ?? 0);
        totalKg += Number(s.shipment?.weight_kg ?? 0);
      }
      const sub: any = (t as any).subunternehmer;
      const overload = computeOverload(
        totalLdm,
        totalKg,
        sub?.max_ldm != null ? Number(sub.max_ldm) : null,
        sub?.max_gewicht_kg != null ? Number(sub.max_gewicht_kg) : null,
      );
      return {
        ...t,
        overload,
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

    // B-4: Pre-Check Overload bei Status-Wechsel auf DISPATCHED.
    // assertCapacityOk (createStop) bleibt für add-pfade.
    if (
      dto.status === 'DISPATCHED' &&
      existing.status !== 'DISPATCHED'
    ) {
      await this.assertReadyForDispatchNv(id);
    }

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
    await this.safeRecalcKm(id);
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
        effective_pallets: true,
        weight_kg: true,
        volume_m3: true,
        ldm: true,
      },
    });
    if (!shipment) return;
    const add = {
      paletten: Number(
        shipment.effective_pallets ?? shipment.package_count ?? 0,
      ),
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
    // Background: cost-recalc + route-optimize blockieren die
    // Response nicht (OSRM ~1-2s). UI invalidiert ein zweites Mal
    // nach 3s und fängt die neuen positions/km ab.
    setImmediate(() => {
      void this.safeRecalc(tourId);
      void this.safeOptimizeTour(tourId);
    });
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
    await this.safeRecalcKm(existing.nv_tour_id);
    return result;
  }

  async removeStop(stopId: string) {
    const existing = await this.prisma.nv_tour_stops.findUnique({
      where: { id: stopId },
    });
    if (!existing) throw new NotFoundException('Stop nicht gefunden');
    await this.prisma.nv_tour_stops.delete({ where: { id: stopId } });
    setImmediate(() => {
      void this.safeRecalc(existing.nv_tour_id);
      void this.safeOptimizeTour(existing.nv_tour_id);
    });
    return { ok: true };
  }

  /**
   * Batch-Mutation: Mehrere stops gleichzeitig add+remove.
   * Capacity-Check kumulativ (current - removed + added vs sub-limits).
   * $transaction für atomare Persistenz.
   * Optimize+Recalc im Background (setImmediate).
   */
  async batchStops(
    tourId: string,
    input: { adds: string[]; removes: string[]; stop_type?: string },
  ) {
    const adds = Array.from(new Set(input.adds ?? [])).filter(Boolean);
    const removes = Array.from(new Set(input.removes ?? [])).filter(Boolean);
    const stopType =
      input.stop_type === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    if (adds.length === 0 && removes.length === 0) {
      return { ok: true, added: 0, removed: 0 };
    }

    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      include: {
        subunternehmer: {
          select: {
            max_paletten: true,
            max_gewicht_kg: true,
            max_volumen_m3: true,
            max_ldm: true,
          },
        },
        stops: {
          select: {
            id: true,
            shipment: {
              select: {
                package_count: true,
                effective_pallets: true,
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

    // Validate removes existieren in dieser Tour
    const stopIdsInTour = new Set(tour.stops.map((s) => s.id));
    for (const r of removes) {
      if (!stopIdsInTour.has(r)) {
        throw new NotFoundException(`Stop ${r} nicht in Tour`);
      }
    }

    // Aggregate current totals
    let curPal = 0;
    let curKg = 0;
    let curM3 = 0;
    let curLdm = 0;
    for (const s of tour.stops) {
      curPal += Number(
        s.shipment.effective_pallets ?? s.shipment.package_count ?? 0,
      );
      curKg += Number(s.shipment.weight_kg ?? 0);
      curM3 += Number(s.shipment.volume_m3 ?? 0);
      curLdm += Number(s.shipment.ldm ?? 0);
    }

    // Subtract removed-stop totals
    const removedSet = new Set(removes);
    for (const s of tour.stops) {
      if (!removedSet.has(s.id)) continue;
      curPal -= Number(
        s.shipment.effective_pallets ?? s.shipment.package_count ?? 0,
      );
      curKg -= Number(s.shipment.weight_kg ?? 0);
      curM3 -= Number(s.shipment.volume_m3 ?? 0);
      curLdm -= Number(s.shipment.ldm ?? 0);
    }

    // Add adds-shipment totals
    const addsShipments =
      adds.length > 0
        ? await this.prisma.shipments.findMany({
            where: { id: { in: adds } },
            select: {
              id: true,
              package_count: true,
              effective_pallets: true,
              weight_kg: true,
              volume_m3: true,
              ldm: true,
            },
          })
        : [];
    const foundIds = new Set(addsShipments.map((s) => s.id));
    for (const a of adds) {
      if (!foundIds.has(a)) {
        throw new NotFoundException(`Sendung ${a} nicht gefunden`);
      }
    }
    for (const sh of addsShipments) {
      curPal += Number(sh.effective_pallets ?? sh.package_count ?? 0);
      curKg += Number(sh.weight_kg ?? 0);
      curM3 += Number(sh.volume_m3 ?? 0);
      curLdm += Number(sh.ldm ?? 0);
    }

    // Cumulative capacity check
    const sub = tour.subunternehmer;
    const checks: {
      axis: string;
      total: number;
      max: number | null;
    }[] = [
      { axis: 'paletten', total: curPal, max: sub?.max_paletten ?? null },
      {
        axis: 'gewicht_kg',
        total: curKg,
        max: sub?.max_gewicht_kg != null ? Number(sub.max_gewicht_kg) : null,
      },
      {
        axis: 'volumen_m3',
        total: curM3,
        max: sub?.max_volumen_m3 != null ? Number(sub.max_volumen_m3) : null,
      },
      {
        axis: 'ldm',
        total: curLdm,
        max: sub?.max_ldm != null ? Number(sub.max_ldm) : null,
      },
    ];
    // B-4: Overload NICHT blockend in batch-stops. Soft-Warnung
    // im Log; assertReadyForDispatchNv (in update()) throwt
    // bei Status-Wechsel auf DISPATCHED.
    const overload = computeOverload(
      curLdm,
      curKg,
      sub?.max_ldm != null ? Number(sub.max_ldm) : null,
      sub?.max_gewicht_kg != null ? Number(sub.max_gewicht_kg) : null,
    );
    if (overload.isOverloaded) {
      this.logger.warn(
        `batchStops(${tourId}): ${formatOverloadMessage(overload)}`,
      );
    }

    // Determine starting position for new stops
    const maxPosRow = await this.prisma.nv_tour_stops.aggregate({
      where: { nv_tour_id: tourId },
      _max: { position: true },
    });
    let nextPos = (maxPosRow._max.position ?? -1) + 1;

    await this.prisma.$transaction(async (tx) => {
      if (removes.length > 0) {
        await tx.nv_tour_stops.deleteMany({
          where: { id: { in: removes } },
        });
      }
      for (const shipmentId of adds) {
        await tx.nv_tour_stops.create({
          data: {
            nv_tour_id: tourId,
            shipment_id: shipmentId,
            position: nextPos,
            stop_type: stopType,
          },
        });
        nextPos += 1;
      }
    });

    setImmediate(() => {
      void this.safeRecalc(tourId);
      void this.safeOptimizeTour(tourId);
    });
    return {
      ok: true,
      added: adds.length,
      removed: removes.length,
    };
  }

  async reorderStops(tourId: string, items: ReorderItemDto[]) {
    await this.prisma.$transaction([
      ...items.map((it) =>
        this.prisma.nv_tour_stops.update({
          where: { id: it.id },
          data: { position: it.position },
        }),
      ),
      // Transient: Polyline invalidieren — FE-Fallback rendert bis
      // safeRouteOnly (Background) die echte Geometry persistiert.
      this.prisma.nv_touren.update({
        where: { id: tourId },
        data: { polyline_geometry: Prisma.JsonNull },
      }),
    ]);
    // AFTER commit: background-recalc + polyline für USER-Order
    // (kein TSP-Reorder — User-Sequenz bleibt erhalten).
    // safeRouteOnly setzt geplante_km mit → kein extra safeRecalcKm.
    setImmediate(() => {
      void this.safeRouteOnly(tourId);
    });
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

    type TG = {
      id: string;
      code: string;
      name: string;
      exact: Set<string>;
      prefixes: string[];
    };
    const parsePattern = (raw: string, exact: Set<string>, prefixes: Set<string>) => {
      const p = raw.trim();
      if (!p) return;
      if (p.endsWith('%')) prefixes.add(p.slice(0, -1));
      else exact.add(p);
    };
    const gebiete: TG[] = tourGebiete.map((g) => {
      const exact = new Set<string>();
      const prefixSet = new Set<string>();
      const pp: unknown = g.plz_pattern;
      if (Array.isArray(pp)) {
        for (const x of pp) if (typeof x === 'string') parsePattern(x, exact, prefixSet);
      } else if (typeof pp === 'string') {
        for (const part of pp.split(',')) parsePattern(part, exact, prefixSet);
      }
      return {
        id: g.id,
        code: g.code,
        name: g.name,
        exact,
        prefixes: Array.from(prefixSet),
      };
    });

    const hasAnyPattern = gebiete.some(
      (g) => g.exact.size > 0 || g.prefixes.length > 0,
    );

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
        if (zip) {
          for (const g of gebiete) {
            if (
              plzMatchesNv(zip, {
                exact: g.exact,
                prefixes: g.prefixes,
              })
            ) {
              matched_tour_gebiet_id = g.id;
              matched_tour_gebiet_code = g.code;
              break;
            }
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
          : !hasAnyPattern || s.matched_tour_gebiet_id !== null,
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
        effective_pallets: true,
        weight_kg: true,
        volume_m3: true,
        ldm: true,
      },
    });
    if (!ship) return true;
    const checks: { val: number; max: number | null }[] = [
      {
        val: Number(ship.effective_pallets ?? ship.package_count ?? 0),
        max: sub.max_paletten ?? null,
      },
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
    // Recalc + Optimize fuer alle moeglicherweise befuellten Touren
    // im Background — Response sofort.
    const tourIdsToRecalc = [tourId];
    if (currentTourId !== tourId) tourIdsToRecalc.push(currentTourId);
    setImmediate(() => {
      for (const tid of tourIdsToRecalc) {
        void this.safeRecalc(tid);
        void this.safeOptimizeTour(tid);
      }
    });
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
                effective_pallets: true,
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
      cur_paletten += Number(
        s.shipment.effective_pallets ?? s.shipment.package_count ?? 0,
      );
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
