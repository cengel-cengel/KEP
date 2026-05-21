/**
 * C1-D Fix#3: recomputeFvSchedule precise-eta Tests.
 *
 * Approach: ToursService direkt mit Mock-Prisma instanziieren.
 * routeWithDurations wird über jest.mock auf osrm.lib gemockt.
 * Tests:
 *  - legDurationsSec aus routeWithDurations gesetzt
 *  - is_charter=true → startCoord=null (kein WH-Vorlauf)
 *  - OSRM-Fail → Haversine-Fallback greift (kein Throw)
 */

// MUST be hoisted before importing tours.service.
const mockRouteWithDurations = jest.fn();
jest.mock('../lib/osrm.lib', () => ({
  routeWithDurations: (...args: any[]) => mockRouteWithDurations(...args),
  routeOnly: jest.fn(),
  routeTrip: jest.fn(),
  routeDistanceKm: jest.fn(),
}));

import { ToursService } from './tours.service';

interface MockShipment {
  id: string;
  tour_position: number;
  delivery_address: { lat: number; lng: number } | null;
  delivery_time_from?: string | null;
  delivery_time_to?: string | null;
  loading_time_from?: string | null;
  loading_time_to?: string | null;
}

function buildTour(args: {
  is_charter: boolean;
  hub_start?: { lat: number; lng: number } | null;
  shipments: MockShipment[];
}) {
  return {
    id: 't-fv-1',
    tour_date: new Date('2026-05-21T00:00:00Z'),
    departure_time: new Date('1970-01-01T08:00:00Z'),
    is_charter: args.is_charter,
    hub_start_address: args.hub_start ?? null,
    shipments: args.shipments.map((s) => ({
      id: s.id,
      tour_position: s.tour_position,
      loading_time_from: s.loading_time_from ?? null,
      loading_time_to: s.loading_time_to ?? null,
      delivery_time_from: s.delivery_time_from ?? null,
      delivery_time_to: s.delivery_time_to ?? null,
      addresses_shipments_delivery_address_idToaddresses: s.delivery_address,
    })),
  };
}

function makePrisma(tour: any) {
  const updates: Array<{ id: string; data: any }> = [];
  const prisma: any = {
    tours: {
      findUnique: jest.fn().mockResolvedValue(tour),
    },
    warehouses: {
      findFirst: jest.fn().mockResolvedValue({ lat: 49.0, lng: 11.0 }),
    },
    shipments: {
      update: jest.fn().mockImplementation((args: any) => {
        updates.push({ id: args.where.id, data: args.data });
        return args;
      }),
    },
    $transaction: jest.fn().mockImplementation((arr: any[]) => Promise.all(arr)),
  };
  return { prisma, updates };
}

function makeSvc(prisma: any): ToursService {
  return new ToursService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

const NUE = { lat: 49.45, lng: 11.08 };
const REGENSBURG = { lat: 49.02, lng: 12.09 };
const MUENCHEN = { lat: 48.14, lng: 11.58 };

describe('ToursService.recomputeFvSchedule precise-eta', () => {
  beforeEach(() => {
    mockRouteWithDurations.mockReset();
  });

  it('legDurationsSec aus routeWithDurations gesetzt — beeinflusst arrivals', async () => {
    const tour = buildTour({
      is_charter: false,
      hub_start: NUE,
      shipments: [
        { id: 'A', tour_position: 1, delivery_address: REGENSBURG },
        { id: 'B', tour_position: 2, delivery_address: MUENCHEN },
      ],
    });
    const { prisma, updates } = makePrisma(tour);
    // Liefere 2 legs mit krummen Werten — die Schedule rechnet hiermit.
    mockRouteWithDurations.mockResolvedValueOnce({
      distance_m: 200000,
      duration_sec: 7200,
      legs: [
        { duration_sec: 3600, distance_m: 100000 },
        { duration_sec: 3600, distance_m: 100000 },
      ],
    });

    const svc = makeSvc(prisma);
    await svc.recomputeFvSchedule('t-fv-1');

    // OSRM wurde mit startCoord (NUE) + 2 shipments = 3 coords aufgerufen.
    expect(mockRouteWithDurations).toHaveBeenCalledTimes(1);
    const [coordsArg] = mockRouteWithDurations.mock.calls[0];
    expect(coordsArg).toHaveLength(3);
    // [lng,lat] convention
    expect(coordsArg[0]).toEqual([NUE.lng, NUE.lat]);
    expect(coordsArg[1]).toEqual([REGENSBURG.lng, REGENSBURG.lat]);

    // 2 Updates persistiert (planned_arrival_fv etc.)
    expect(updates).toHaveLength(2);
    expect(updates[0].data.planned_arrival_fv).toBeInstanceOf(Date);
    expect(updates[1].data.planned_arrival_fv).toBeInstanceOf(Date);
  });

  it('is_charter=true → startCoord=null, OSRM-coords ohne WH-Vorlauf', async () => {
    const tour = buildTour({
      is_charter: true,
      hub_start: NUE, // wird IGNORED weil is_charter=true
      shipments: [
        { id: 'A', tour_position: 1, delivery_address: REGENSBURG },
        { id: 'B', tour_position: 2, delivery_address: MUENCHEN },
      ],
    });
    const { prisma } = makePrisma(tour);
    mockRouteWithDurations.mockResolvedValueOnce({
      distance_m: 100000,
      duration_sec: 3600,
      legs: [{ duration_sec: 3600, distance_m: 100000 }],
    });

    const svc = makeSvc(prisma);
    await svc.recomputeFvSchedule('t-fv-1');

    expect(mockRouteWithDurations).toHaveBeenCalledTimes(1);
    const [coordsArg] = mockRouteWithDurations.mock.calls[0];
    // Charter: nur 2 stops, KEIN WH-Vorlauf.
    expect(coordsArg).toHaveLength(2);
    expect(coordsArg[0]).toEqual([REGENSBURG.lng, REGENSBURG.lat]);
    expect(coordsArg[1]).toEqual([MUENCHEN.lng, MUENCHEN.lat]);
  });

  it('OSRM-Fail → Haversine-Fallback greift (kein Throw, Schedule persistiert)', async () => {
    const tour = buildTour({
      is_charter: false,
      hub_start: NUE,
      shipments: [
        { id: 'A', tour_position: 1, delivery_address: REGENSBURG },
      ],
    });
    const { prisma, updates } = makePrisma(tour);
    mockRouteWithDurations.mockRejectedValueOnce(new Error('OSRM timeout'));

    const svc = makeSvc(prisma);
    await expect(svc.recomputeFvSchedule('t-fv-1')).resolves.toBeDefined();

    // Update wurde trotzdem durchgeführt (Haversine-Fallback).
    expect(updates).toHaveLength(1);
    expect(updates[0].data.planned_arrival_fv).toBeInstanceOf(Date);
  });

  it('OSRM gibt null → Haversine-Fallback (legs werden ignoriert)', async () => {
    const tour = buildTour({
      is_charter: false,
      hub_start: NUE,
      shipments: [
        { id: 'A', tour_position: 1, delivery_address: REGENSBURG },
      ],
    });
    const { prisma, updates } = makePrisma(tour);
    mockRouteWithDurations.mockResolvedValueOnce(null);

    const svc = makeSvc(prisma);
    await svc.recomputeFvSchedule('t-fv-1');
    expect(updates).toHaveLength(1);
  });
});
