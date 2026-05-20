import {
  BadRequestException,
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
import {
  routeDistanceKm,
  routeOnly,
  routeTrip,
  routeWithDurations,
} from '../lib/osrm.lib';
import { computeStopSchedule } from './scheduler.lib';
import {
  getNvPlzSet,
  plzMatchesNv,
  type NvPlzSet,
} from '../lib/nv-plz.lib';
import { computeOverload, formatOverloadMessage } from '../lib/capacity.lib';
import {
  detectConflictsForTour,
  type DetectInputTour,
  type Conflict,
} from '../lib/conflicts.lib';
import {
  computeEffectiveLdm,
  isShipmentFullyStackable,
} from '../lib/stackable.lib';
import { buildAddressQuery, nominatimGeocode } from '../lib/nominatim.lib';

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
      wochentage: true,
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
      has_adr_license: true,
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
          customers: {
            select: { id: true, name: true, customer_number: true },
          },
          loading_date: true,
          delivery_date: true,
          package_count: true,
          weight_kg: true,
          volume_m3: true,
          ldm: true,
          is_hazmat: true,
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
          shipment_package_items: { select: { stackable: true } },
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

  /** W-2: recompute planned_arrival/departure pro Stop. */
  private async safeRecomputeSchedule(tourId: string) {
    try {
      await this.recomputeSchedule(tourId);
    } catch (err: any) {
      this.logger.warn(
        `recomputeSchedule(${tourId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  async recomputeSchedule(tourId: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      select: {
        id: true,
        datum: true,
        start_zeit: true,
        stops: {
          orderBy: [{ position: 'asc' }],
          select: {
            id: true,
            position: true,
            servicezeit_min: true,
            stop_type: true,
            shipment: {
              select: {
                loading_time_from: true,
                loading_time_to: true,
                delivery_time_from: true,
                delivery_time_to: true,
                addresses_shipments_loading_address_idToaddresses: {
                  select: { lat: true, lng: true },
                },
                addresses_shipments_delivery_address_idToaddresses: {
                  select: { lat: true, lng: true },
                },
              },
            },
          },
        },
      },
    });
    if (!tour || tour.stops.length === 0) return null;
    const startHHMM = tour.start_zeit
      ? `${tour.start_zeit.getUTCHours().toString().padStart(2, '0')}:${tour.start_zeit
          .getUTCMinutes()
          .toString()
          .padStart(2, '0')}`
      : null;
    const wh = await this.prisma.warehouses.findFirst({
      where: { is_default: true, active: true },
      select: { lat: true, lng: true },
    });
    const startCoord =
      wh && wh.lat != null && wh.lng != null
        ? { lat: Number(wh.lat), lng: Number(wh.lng) }
        : null;
    const stopsInput = tour.stops.map((s: any) => {
      const addr =
        s.stop_type === 'DELIVERY'
          ? s.shipment?.addresses_shipments_delivery_address_idToaddresses
          : s.shipment?.addresses_shipments_loading_address_idToaddresses;
      const timeToString = (t: any): string | null => {
        if (!t) return null;
        if (typeof t === 'string') return t;
        const d = new Date(t);
        return `${d.getUTCHours().toString().padStart(2, '0')}:${d
          .getUTCMinutes()
          .toString()
          .padStart(2, '0')}`;
      };
      return {
        id: s.id,
        position: s.position,
        servicezeit_min: s.servicezeit_min,
        stop_type: s.stop_type,
        lat: addr?.lat != null ? Number(addr.lat) : null,
        lng: addr?.lng != null ? Number(addr.lng) : null,
        loading_time_from: timeToString(s.shipment?.loading_time_from),
        loading_time_to: timeToString(s.shipment?.loading_time_to),
        delivery_time_from: timeToString(s.shipment?.delivery_time_from),
        delivery_time_to: timeToString(s.shipment?.delivery_time_to),
      };
    });

    // T-3.1: Precise-ETA via OSRM. Coord-Sequenz inkl. startCoord.
    let legDurationsSec: number[] | undefined;
    const coords: Array<[number, number]> = [];
    if (startCoord) coords.push([startCoord.lng, startCoord.lat]);
    for (const s of stopsInput) {
      if (s.lat != null && s.lng != null) coords.push([s.lng, s.lat]);
    }
    if (coords.length >= 2) {
      const r = await routeWithDurations(coords);
      if (r && r.legs.length >= 1) {
        // Per-Stop-Travel-Time. Wenn kein startCoord, ist legs[0]
        // erste-zu-zweite-Stop (also stop_1.travel = legs[0]).
        // Wenn startCoord vorhanden: legs[0] = start→stop_0,
        // legs[1] = stop_0→stop_1 etc.
        const offset = startCoord ? 0 : 1;
        legDurationsSec = stopsInput.map((_, i) => r.legs[i - offset]?.duration_sec ?? 0);
        if (!startCoord) {
          // erstes Element kein Leg → 0
          legDurationsSec[0] = 0;
        }
      }
    }

    const sched = computeStopSchedule({
      datum: tour.datum,
      startZeit: startHHMM,
      startCoord,
      stops: stopsInput,
      legDurationsSec,
    });
    await this.prisma.$transaction(
      sched.map((s) =>
        this.prisma.nv_tour_stops.update({
          where: { id: s.id },
          data: {
            planned_arrival: s.planned_arrival,
            planned_departure: s.planned_departure,
            risk_score: s.risk_score,
            risk_severity: s.risk_severity,
          },
        }),
      ),
    );
    return sched.length;
  }

  /**
   * B-4 + B-4.5: Aggregat aus tour.stops.shipment + sub.max_* →
   * Overload. LDM via Cross-Shipment Effective-Pairing (Stapeln
   * spart Boden-LDM). Weight = naive Σ.
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
              select: {
                ldm: true,
                weight_kg: true,
                height_cm: true,
                shipment_package_items: { select: { stackable: true } },
              },
            },
          },
        },
      },
    });
    if (!tour) return null;
    const stackShips = tour.stops.map((s) => ({
      ldm: Number(s.shipment.ldm ?? 0),
      height_cm: Number(s.shipment.height_cm ?? 0),
      weight_kg: Number(s.shipment.weight_kg ?? 0),
      stackable: isShipmentFullyStackable(s.shipment.shipment_package_items),
    }));
    const totalLdm = computeEffectiveLdm(stackShips);
    let totalKg = 0;
    for (const s of tour.stops) totalKg += Number(s.shipment.weight_kg ?? 0);
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
    const augmented: T[] = tours.map((t) => {
      const set = t.nv_stamm_tour_id
        ? byStamm.get(t.nv_stamm_tour_id) ?? null
        : null;
      // B-4 + B-4.5: Overload on-the-fly. LDM = Effective-Pairing
      // aus TOUR_INCLUDE (stops.shipment + package_items).
      const stackShips = (t.stops as any[]).map((s) => ({
        ldm: Number(s.shipment?.ldm ?? 0),
        height_cm: Number(s.shipment?.height_cm ?? 0),
        weight_kg: Number(s.shipment?.weight_kg ?? 0),
        stackable: isShipmentFullyStackable(
          s.shipment?.shipment_package_items ?? [],
        ),
      }));
      const totalLdm = computeEffectiveLdm(stackShips);
      let totalKg = 0;
      for (const s of t.stops as any[]) {
        totalKg += Number(s.shipment?.weight_kg ?? 0);
      }
      const sub: any = (t as any).subunternehmer;
      const overload = computeOverload(
        totalLdm,
        totalKg,
        sub?.max_ldm != null ? Number(sub.max_ldm) : null,
        sub?.max_gewicht_kg != null ? Number(sub.max_gewicht_kg) : null,
      );
      // T-3.1: tour.risk on-the-fly aus stops.risk_severity.
      let max_score = 0;
      let critical_count = 0;
      let warning_count = 0;
      for (const s of t.stops as any[]) {
        const sc = Number(s.risk_score ?? 0);
        if (sc > max_score) max_score = sc;
        if (s.risk_severity === 'critical') critical_count++;
        else if (s.risk_severity === 'warning') warning_count++;
      }
      const risk = { max_score, critical_count, warning_count };
      // T-3.2: Conflict-Detection benötigt anderer-Touren-Spans.
      // Wird in 2. Phase nach loop unten gefüllt — hier nur
      // Slot reservieren.
      return {
        ...t,
        overload,
        risk,
        conflicts: [] as Conflict[],
        conflict_count: 0,
        has_critical_conflict: false,
        stops: t.stops.map((s: any) => ({
          ...s,
          is_stamm_kunde:
            !!s.shipment?.customer_id &&
            !!set &&
            set.has(s.shipment.customer_id),
        })),
      } as T;
    });
    // T-3.2: Konflikt-Detection (Phase 2) — pro Tour über alle
    // anderen am gleichen Tag gleichen Sub.
    const detectInputs: DetectInputTour[] = augmented.map((t: any) => ({
      id: t.id,
      datum: new Date(t.datum),
      subunternehmer_id: t.subunternehmer_id ?? t.subunternehmer?.id ?? null,
      sub_has_adr_license: t.subunternehmer?.has_adr_license ?? null,
      overload: t.overload ? { isOverloaded: t.overload.isOverloaded } : null,
      stops: (t.stops ?? []).map((s: any) => ({
        id: s.id,
        risk_severity: s.risk_severity,
        is_hazmat: s.shipment?.is_hazmat ?? null,
        planned_arrival: s.planned_arrival ? new Date(s.planned_arrival) : null,
        planned_departure: s.planned_departure
          ? new Date(s.planned_departure)
          : null,
        loading_time_from: s.shipment?.loading_time_from
          ? new Date(s.shipment.loading_time_from)
          : null,
        loading_time_to: s.shipment?.loading_time_to
          ? new Date(s.shipment.loading_time_to)
          : null,
        delivery_time_from: s.shipment?.delivery_time_from
          ? new Date(s.shipment.delivery_time_from)
          : null,
        delivery_time_to: s.shipment?.delivery_time_to
          ? new Date(s.shipment.delivery_time_to)
          : null,
        stop_type: s.stop_type,
      })),
    }));
    for (let i = 0; i < augmented.length; i++) {
      const conflicts = detectConflictsForTour(
        detectInputs[i],
        detectInputs,
      );
      (augmented[i] as any).conflicts = conflicts;
      (augmented[i] as any).conflict_count = conflicts.length;
      (augmented[i] as any).has_critical_conflict = conflicts.some(
        (c) => c.severity === 'critical',
      );
    }
    return augmented;
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

  /**
   * P0-8: NV-Beladeplan-Daten. Liefert tour + shipments mit
   * FULL shipment_package_items für LoadingPlan3D-Rendering.
   * Eigener Endpoint (statt TOUR_INCLUDE erweitern) damit
   * list-Endpoints nicht teurer werden.
   */
  async getLoadingDetail(id: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id },
      select: {
        id: true,
        datum: true,
        status: true,
        fahrzeug_typ: true,
        nv_stamm_tour: {
          select: { code: true, name: true },
        },
        subunternehmer: {
          select: { id: true, name: true, fahrzeug_typ: true },
        },
        stops: {
          orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
          select: {
            id: true,
            position: true,
            shipment: {
              select: {
                id: true,
                shipment_number: true,
                weight_kg: true,
                ldm: true,
                length_cm: true,
                width_cm: true,
                height_cm: true,
                shipment_package_items: {
                  orderBy: [{ line_index: 'asc' }],
                  select: {
                    id: true,
                    line_index: true,
                    package_type: true,
                    quantity: true,
                    length_cm: true,
                    width_cm: true,
                    height_cm: true,
                    weight_kg: true,
                    stackable: true,
                    pos_x_cm: true,
                    pos_y_cm: true,
                    pos_z_cm: true,
                    rotation_deg: true,
                  },
                },
              },
            },
          },
        },
      } as any,
    });
    if (!tour) throw new NotFoundException('NV-Tour nicht gefunden');
    return tour;
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

    // B-4 + P0-6: Pre-Check Overload bei Status-Wechsel auf IN_PROGRESS
    // (Trigger ehemals DISPATCHED — siehe Status-Reduktion 5→3).
    // assertCapacityOk (createStop) bleibt für add-pfade.
    if (
      dto.status === 'IN_PROGRESS' &&
      existing.status !== 'IN_PROGRESS'
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
      void this.safeRecomputeSchedule(tourId);
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
      void this.safeRecomputeSchedule(existing.nv_tour_id);
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
      void this.safeRecomputeSchedule(tourId);
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
      void this.safeRecomputeSchedule(tourId);
    });
    await this.safeRecalc(tourId);
    return { count: items.length };
  }

  /**
   * T-3.2 apply-action — Conflict-driven Mutations.
   * SHIFT_STOP_LATER: +15min servicezeit (oder dto.shift_minutes)
   * SWAP_DRIVER: PATCH subunternehmer_id
   * MOVE_STOP_TO_TOUR: shipment via batch-stops cross-tour
   * SPLIT_TOUR_AT_STOP: delegiert an splitTour()
   */
  async applyAction(
    tourId: string,
    dto: {
      action_type:
        | 'SHIFT_STOP_LATER'
        | 'SPLIT_TOUR_AT_STOP'
        | 'SWAP_DRIVER'
        | 'MOVE_STOP_TO_TOUR';
      stop_id?: string;
      new_subunternehmer_id?: string;
      target_tour_id?: string;
      shift_minutes?: number;
    },
  ) {
    switch (dto.action_type) {
      case 'SHIFT_STOP_LATER': {
        if (!dto.stop_id) {
          throw new BadRequestException('stop_id required für SHIFT_STOP_LATER');
        }
        const shift = Math.max(5, Math.min(120, dto.shift_minutes ?? 15));
        const stop = await this.prisma.nv_tour_stops.findUnique({
          where: { id: dto.stop_id },
          select: { servicezeit_min: true, nv_tour_id: true },
        });
        if (!stop) throw new NotFoundException('Stop nicht gefunden');
        const newSz = (stop.servicezeit_min ?? 30) + shift;
        await this.prisma.nv_tour_stops.update({
          where: { id: dto.stop_id },
          data: { servicezeit_min: newSz },
        });
        setImmediate(() => {
          void this.safeRecomputeSchedule(stop.nv_tour_id);
        });
        return { ok: true, action: 'SHIFT_STOP_LATER', stop_id: dto.stop_id, new_servicezeit_min: newSz };
      }
      case 'SWAP_DRIVER': {
        if (!dto.new_subunternehmer_id) {
          throw new BadRequestException('new_subunternehmer_id required');
        }
        await this.prisma.nv_touren.update({
          where: { id: tourId },
          data: { subunternehmer_id: dto.new_subunternehmer_id },
        });
        return { ok: true, action: 'SWAP_DRIVER' };
      }
      case 'MOVE_STOP_TO_TOUR': {
        if (!dto.stop_id || !dto.target_tour_id) {
          throw new BadRequestException(
            'stop_id + target_tour_id required für MOVE_STOP_TO_TOUR',
          );
        }
        const stop = await this.prisma.nv_tour_stops.findUnique({
          where: { id: dto.stop_id },
          select: { shipment_id: true, nv_tour_id: true },
        });
        if (!stop) throw new NotFoundException('Stop nicht gefunden');
        await this.batchStops(stop.nv_tour_id, {
          adds: [],
          removes: [dto.stop_id],
        });
        await this.batchStops(dto.target_tour_id, {
          adds: [stop.shipment_id],
          removes: [],
        });
        return { ok: true, action: 'MOVE_STOP_TO_TOUR' };
      }
      case 'SPLIT_TOUR_AT_STOP': {
        if (!dto.stop_id) {
          throw new BadRequestException('stop_id required für SPLIT_TOUR_AT_STOP');
        }
        return this.splitTour(tourId, dto.stop_id);
      }
      default:
        throw new BadRequestException(`Unbekannte Action: ${(dto as any).action_type}`);
    }
  }

  /**
   * T-3.2 splitTour: erstellt neue Tour mit denselben Tour-Daten
   * (Datum, Sub, Fahrzeug) und transferiert alle Stops ab from_stop
   * (inkl.) in die neue Tour. Original-Tour behält die Stops davor.
   */

  /**
   * C-2 Sendung-Splitten:
   *   - Original-Shipment behält Items NICHT in splitItemIds[].
   *   - Neue Shipment klont scalar-Felder (customer, addresses, dates,
   *     hazmat, etc.) und übernimmt die splitItemIds-Items per
   *     UPDATE shipment_id (move, kein clone — decision 1A).
   *   - weight_kg + package_count beider Shipments rekomputiert
   *     aus SUM(items.weight_kg) bzw. SUM(quantity).
   *   - pos_x_cm/y/z der gemoveten Items auf NULL (re-pack-Bedarf).
   *   - Neuer Stop direkt nach current (position+1, übrige Stops
   *     verschoben). Beide Stops in derselben Tour.
   *   - split_from_id auf neuem Shipment für Audit-Trail.
   */
  async splitShipmentAtStop(
    tourId: string,
    stopId: string,
    splitItemIds: string[],
  ) {
    if (!splitItemIds || splitItemIds.length === 0) {
      throw new BadRequestException('splitItemIds darf nicht leer sein.');
    }
    const stop = await this.prisma.nv_tour_stops.findUnique({
      where: { id: stopId },
      select: {
        id: true,
        nv_tour_id: true,
        position: true,
        stop_type: true,
        servicezeit_min: true,
        shipment: {
          select: {
            id: true,
            shipment_number: true,
            customer_id: true,
            customer_ref: true,
            status: true,
            loading_address_id: true,
            delivery_address_id: true,
            loading_date: true,
            loading_time_from: true,
            loading_time_to: true,
            delivery_date: true,
            delivery_time_from: true,
            delivery_time_to: true,
            package_type: true,
            transport_type: true,
            incoterm: true,
            freight_payer: true,
            is_hazmat: true,
            hazmat_class: true,
            hazmat_un_number: true,
            hazmat_packing_group: true,
            hazmat_description: true,
            comment: true,
            created_by: true,
            shipment_package_items: {
              select: { id: true, quantity: true, weight_kg: true },
            },
          },
        },
      },
    });
    if (!stop) throw new NotFoundException('Stop nicht gefunden');
    if (stop.nv_tour_id !== tourId) {
      throw new BadRequestException('Stop gehört nicht zur angegebenen Tour.');
    }
    const orig = stop.shipment;
    if (!orig) throw new NotFoundException('Stop hat keine Sendung.');
    const allItemIds = orig.shipment_package_items.map((i) => i.id);
    const moveSet = new Set(splitItemIds);
    const validMoveIds = splitItemIds.filter((id) => allItemIds.includes(id));
    if (validMoveIds.length !== splitItemIds.length) {
      throw new BadRequestException(
        'splitItemIds enthält IDs die nicht zur Original-Sendung gehören.',
      );
    }
    const remainItems = orig.shipment_package_items.filter(
      (i) => !moveSet.has(i.id),
    );
    if (remainItems.length === 0 || validMoveIds.length === orig.shipment_package_items.length) {
      throw new BadRequestException(
        'Mindestens 1 Item muss in Original verbleiben (kein All-or-Nothing-Split).',
      );
    }
    const moveItems = orig.shipment_package_items.filter((i) =>
      moveSet.has(i.id),
    );

    // Aggregate-Recompute (per-row sum, decision 8A).
    const sumKg = (rows: typeof orig.shipment_package_items) =>
      rows.reduce((acc, r) => acc + Number(r.weight_kg ?? 0), 0);
    const sumQty = (rows: typeof orig.shipment_package_items) =>
      rows.reduce((acc, r) => acc + Number(r.quantity ?? 1), 0);

    const newWeightOrig = sumKg(remainItems);
    const newCountOrig = sumQty(remainItems);
    const newWeightSplit = sumKg(moveItems);
    const newCountSplit = sumQty(moveItems);

    // Shipment-Nr per Sequence (mirror shipments.service Pattern:
    // S{YY}-{seq6}, z.B. S26-001234).
    const seqRows = await this.prisma.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('shipment_number_seq')
    `;
    const yr = new Date().getFullYear().toString().slice(-2);
    const newNumber = `S${yr}-${seqRows[0].nextval.toString().padStart(6, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      // 1) Original-Shipment Aggregate aktualisieren.
      await tx.shipments.update({
        where: { id: orig.id },
        data: {
          weight_kg: newWeightOrig,
          package_count: newCountOrig,
        },
      });
      // 2) Neue Shipment erzeugen (scalar-Felder inherit).
      const newShipment = await tx.shipments.create({
        data: {
          shipment_number: newNumber,
          customer_id: orig.customer_id,
          customer_ref: orig.customer_ref,
          status: orig.status,
          loading_address_id: orig.loading_address_id,
          delivery_address_id: orig.delivery_address_id,
          loading_date: orig.loading_date,
          loading_time_from: orig.loading_time_from,
          loading_time_to: orig.loading_time_to,
          delivery_date: orig.delivery_date,
          delivery_time_from: orig.delivery_time_from,
          delivery_time_to: orig.delivery_time_to,
          package_type: orig.package_type,
          package_count: newCountSplit,
          weight_kg: newWeightSplit,
          transport_type: orig.transport_type,
          incoterm: orig.incoterm,
          freight_payer: orig.freight_payer,
          is_hazmat: orig.is_hazmat,
          hazmat_class: orig.hazmat_class,
          hazmat_un_number: orig.hazmat_un_number,
          hazmat_packing_group: orig.hazmat_packing_group,
          hazmat_description: orig.hazmat_description,
          comment: orig.comment,
          created_by: orig.created_by,
          split_from_id: orig.id,
        },
      });
      // 3) Items verschieben (shipment_id-Update + pos_*-Reset).
      await tx.shipment_package_items.updateMany({
        where: { id: { in: validMoveIds } },
        data: {
          shipment_id: newShipment.id,
          pos_x_cm: null,
          pos_y_cm: null,
          pos_z_cm: null,
        },
      });
      // 4) Nachfolgende Stops verschieben (position +1).
      await tx.nv_tour_stops.updateMany({
        where: {
          nv_tour_id: tourId,
          position: { gt: stop.position },
        },
        data: { position: { increment: 1 } },
      });
      // 5) Neuer Stop für neue Sendung — direkt nach current.
      const newStop = await tx.nv_tour_stops.create({
        data: {
          nv_tour_id: tourId,
          shipment_id: newShipment.id,
          position: stop.position + 1,
          stop_type: stop.stop_type,
          servicezeit_min: stop.servicezeit_min,
        },
      });
      return {
        original_shipment_id: orig.id,
        new_shipment_id: newShipment.id,
        new_shipment_number: newNumber,
        new_stop_id: newStop.id,
        moved_item_count: validMoveIds.length,
      };
    });
  }

  async splitTour(tourId: string, fromStopId: string) {
    const orig = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      select: {
        id: true,
        datum: true,
        nv_stamm_tour_id: true,
        subunternehmer_id: true,
        fahrzeug_typ: true,
        start_zeit: true,
        kosten_modus: true,
        stops: {
          orderBy: [{ position: 'asc' }],
          select: { id: true, shipment_id: true, position: true, stop_type: true, servicezeit_min: true },
        },
      },
    });
    if (!orig) throw new NotFoundException('NV-Tour nicht gefunden');
    const cutIdx = orig.stops.findIndex((s) => s.id === fromStopId);
    if (cutIdx < 0) {
      throw new BadRequestException('from_stop_id nicht in Tour');
    }
    if (cutIdx === 0) {
      throw new BadRequestException('Split nicht am ersten Stop — bewege Stops anders.');
    }
    const stopsToMove = orig.stops.slice(cutIdx);
    if (stopsToMove.length === 0) {
      throw new BadRequestException('Keine Stops zum Splitten ab Cut-Punkt');
    }

    // Neue Tour mit gleichen Werten erstellen
    const newTour = await this.prisma.nv_touren.create({
      data: {
        datum: orig.datum,
        nv_stamm_tour_id: orig.nv_stamm_tour_id,
        subunternehmer_id: orig.subunternehmer_id,
        fahrzeug_typ: orig.fahrzeug_typ,
        start_zeit: orig.start_zeit,
        kosten_modus: orig.kosten_modus,
        status: 'PLANNING',
      },
      select: { id: true },
    });

    // Stops cross-tour transferieren via $transaction
    await this.prisma.$transaction(async (tx) => {
      let pos = 0;
      for (const s of stopsToMove) {
        await tx.nv_tour_stops.update({
          where: { id: s.id },
          data: {
            nv_tour_id: newTour.id,
            position: pos++,
          },
        });
      }
    });

    setImmediate(() => {
      void this.safeRecomputeSchedule(tourId);
      void this.safeRecomputeSchedule(newTour.id);
      void this.safeRecalc(tourId);
      void this.safeRecalc(newTour.id);
    });

    return {
      ok: true,
      action: 'SPLIT_TOUR_AT_STOP',
      new_tour_id: newTour.id,
      moved_stops: stopsToMove.length,
    };
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

    // P0-6.3 BUG 2: matched-only filter unten — kein hasAnyPattern-
    // Fallback (Carlos: kein Pattern = kein Shipment in NV-Dispo).

    const stoppedShipmentIds = new Set(
      (
        await this.prisma.nv_tour_stops.findMany({
          where: {
            stop_type: mode,
            status: { notIn: ['COMPLETED', 'FAILED'] },
            nv_tour: {
              status: { in: ['PLANNING', 'IN_PROGRESS'] },
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
          : s.matched_tour_gebiet_id !== null,
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

  /**
   * A' Sprint: Geocoding-Backfill per Tour.
   * Iteriert über tour.stops, sammelt addresses-IDs (loading +
   * delivery je nach stop_type), filtert die mit lat=null,
   * geocoded via Nominatim (1.1s throttle), updated addresses.lat/lng.
   *
   * Idempotent: bereits-geocodete Adressen werden geskippt.
   * Sequential (kein Parallel) wegen Nominatim Fair-Use 1req/sec.
   */
  async geocodeTourStops(tourId: string) {
    const tour = await this.prisma.nv_touren.findUnique({
      where: { id: tourId },
      select: {
        id: true,
        stops: {
          select: {
            id: true,
            stop_type: true,
            shipment: {
              select: {
                addresses_shipments_loading_address_idToaddresses: {
                  select: { id: true, lat: true, lng: true, street: true,
                            zip: true, city: true, country_code: true },
                },
                addresses_shipments_delivery_address_idToaddresses: {
                  select: { id: true, lat: true, lng: true, street: true,
                            zip: true, city: true, country_code: true },
                },
              },
            },
          },
        },
      },
    });
    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);

    // Adressen sammeln (deduplicate by address.id).
    const addrMap = new Map<
      string,
      {
        id: string;
        street: string | null;
        zip: string | null;
        city: string | null;
        country_code: string | null;
        lat: unknown;
        lng: unknown;
      }
    >();
    for (const s of tour.stops) {
      const addr =
        s.stop_type === 'DELIVERY'
          ? s.shipment.addresses_shipments_delivery_address_idToaddresses
          : s.shipment.addresses_shipments_loading_address_idToaddresses;
      if (!addr) continue;
      if (!addrMap.has(addr.id)) addrMap.set(addr.id, addr);
    }

    const candidates = [...addrMap.values()].filter(
      (a) => a.lat == null || a.lng == null,
    );

    let geocoded = 0;
    let failed = 0;
    for (const a of candidates) {
      const query = buildAddressQuery({
        street: a.street,
        zip: a.zip,
        city: a.city,
        country: a.country_code,
      });
      if (!query) {
        failed++;
        continue;
      }
      const result = await nominatimGeocode(query);
      if (!result) {
        failed++;
        continue;
      }
      await this.prisma.addresses.update({
        where: { id: a.id },
        data: {
          lat: result.lat.toString(),
          lng: result.lng.toString(),
        },
      });
      geocoded++;
    }

    return {
      total: addrMap.size,
      candidates: candidates.length,
      geocoded,
      failed,
      skipped: addrMap.size - candidates.length,
    };
  }
}
