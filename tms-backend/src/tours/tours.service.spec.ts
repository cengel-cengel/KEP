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

// ═══ R2.1: consolidateOrCreateFvTour ═══════════════════════════
//
// Tests die Idempotenz-Guards + Action-Returns. tourMatcher wird
// via jest.spyOn auf findBestMatchForShipment gemockt; Prisma-CRUD
// wird Mock-getrackt für Assertions.

function makeShipment(over: Partial<any> = {}): any {
  return {
    id: 'S-1',
    status: 'in_warehouse',
    tour_id: null,
    classification: 'CHARTER_UMSCHLAG',
    has_active_lock: false,
    lock_types: null,
    delivery_date: new Date('2026-05-22T00:00:00Z'),
    loading_date: new Date('2026-05-21T00:00:00Z'),
    ldm: 5,
    weight_kg: 8000,
    is_hazmat: false,
    ...over,
  };
}

function makeConsolidatePrisma(opts: {
  shipment?: any;
  matchTour?: any;
  newTourId?: string;
} = {}) {
  const updates: any[] = [];
  const created: any[] = [];
  let findUniqueCount = 0;
  const newTourId = opts.newTourId ?? 't-new';
  const prisma: any = {
    shipments: {
      findFirst: jest.fn().mockResolvedValue(opts.shipment ?? null),
      update: jest.fn().mockImplementation((args: any) => {
        updates.push(args);
        return args;
      }),
      // R2.4: tryLinkToFvTour nutzt updateMany (race-safe).
      updateMany: jest.fn().mockImplementation((args: any) => {
        updates.push(args);
        return { count: 1 };
      }),
    },
    tours: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        findUniqueCount++;
        // 1. Aufruf = Match-tryLink; 2. Aufruf = Create-tryLink.
        // matchTour wird beim 1. zurück gegeben (wenn vorhanden);
        // beim 2. (newTourId) auto-create-Tour.
        if (where.id === newTourId) {
          return {
            id: newTourId,
            status: 'planned',
            subcontractor_id: null,
            subcontractors: null,
            shipments: [],
          };
        }
        return opts.matchTour ?? null;
      }),
      create: jest.fn().mockImplementation((args: any) => {
        const t = { id: newTourId, ...args.data };
        created.push(t);
        return t;
      }),
    },
    users: {
      findFirst: jest.fn().mockResolvedValue({ id: 'u-1' }),
    },
  };
  void findUniqueCount;
  return { prisma, updates, created };
}

function makeConsolidateSvc(prisma: any, opts?: {
  warehouses?: any;
}): ToursService {
  const warehouses = opts?.warehouses ?? {
    // Default-Mock: kein Umschlag-WH konfiguriert (returns null).
    ensureUmschlagAddressId: jest.fn().mockResolvedValue(null),
    getUmschlagWarehouse: jest.fn().mockResolvedValue(null),
  };
  return new ToursService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    warehouses as any,
  );
}

describe('ToursService.consolidateOrCreateFvTour — idempotenz', () => {
  it('not_found wenn Sendung nicht existiert', async () => {
    const { prisma } = makeConsolidatePrisma({ shipment: null });
    const svc = makeConsolidateSvc(prisma);
    const res = await svc.consolidateOrCreateFvTour('S-x');
    expect(res).toEqual({ action: 'skipped', reason: 'not_found' });
  });

  it('already_assigned wenn tour_id schon gesetzt', async () => {
    const { prisma } = makeConsolidatePrisma({
      shipment: makeShipment({ tour_id: 't-existing' }),
    });
    const svc = makeConsolidateSvc(prisma);
    const res = await svc.consolidateOrCreateFvTour('S-1');
    expect(res).toEqual({
      action: 'skipped',
      reason: 'already_assigned',
    });
  });

  it('wrong_status wenn nicht in_warehouse', async () => {
    const { prisma } = makeConsolidatePrisma({
      shipment: makeShipment({ status: 'new' }),
    });
    const svc = makeConsolidateSvc(prisma);
    const res = await svc.consolidateOrCreateFvTour('S-1');
    expect(res.action).toBe('skipped');
    expect(res.reason).toBe('wrong_status');
  });

  it('not_charter_umschlag wenn andere classification', async () => {
    const { prisma } = makeConsolidatePrisma({
      shipment: makeShipment({ classification: 'SAMMELGUT' }),
    });
    const svc = makeConsolidateSvc(prisma);
    const res = await svc.consolidateOrCreateFvTour('S-1');
    expect(res.reason).toBe('not_charter_umschlag');
  });

  it('shipment_locked wenn aktive Sperre', async () => {
    const { prisma } = makeConsolidatePrisma({
      shipment: makeShipment({ has_active_lock: true }),
    });
    const svc = makeConsolidateSvc(prisma);
    const res = await svc.consolidateOrCreateFvTour('S-1');
    expect(res.reason).toBe('shipment_locked');
  });
});

describe('ToursService.consolidateOrCreateFvTour — action paths', () => {
  it('consolidated wenn FV-Match vorhanden', async () => {
    // Match-Tour mit kompatiblem ADR-Sub + status='planned'.
    const matchTour = {
      id: 't-match',
      status: 'planned',
      subcontractor_id: 'sub-1',
      subcontractors: { has_adr_license: true },
      shipments: [{ id: 'X', tour_position: 1 }],
    };
    const { prisma, updates } = makeConsolidatePrisma({
      shipment: makeShipment(),
      matchTour,
    });
    const svc = makeConsolidateSvc(prisma);
    jest.spyOn(svc, 'findBestMatchForShipment').mockResolvedValue([
      { tour_id: 't-match', mode: 'fv', score: 85, factors: [], reason: '' },
    ] as any);

    const res = await svc.consolidateOrCreateFvTour('S-1');
    expect(res.action).toBe('consolidated');
    expect(res.tourId).toBe('t-match');
    // Status BLEIBT 'in_warehouse' — kein status='dispatched' im update
    expect(updates).toHaveLength(1);
    expect(updates[0].data.tour_id).toBe('t-match');
    expect(updates[0].data.status).toBeUndefined();
  });

  it('created wenn keine FV-Match (leere matches)', async () => {
    const { prisma, created } = makeConsolidatePrisma({
      shipment: makeShipment(),
      newTourId: 't-new',
    });
    const svc = makeConsolidateSvc(prisma);
    jest
      .spyOn(svc, 'findBestMatchForShipment')
      .mockResolvedValue([] as any);

    const res = await svc.consolidateOrCreateFvTour('S-1');
    expect(res.action).toBe('created');
    expect(res.tourId).toBe('t-new');
    expect(created).toHaveLength(1);
    expect(created[0].tour_date).toBeInstanceOf(Date);
    expect(created[0].status).toBe('planned');
    expect(created[0].max_ldm).toBe(13.6);
    expect(created[0].subcontractor_id).toBeUndefined();
  });

  it('NV-Matches werden IGNORED (nur FV-consolidation)', async () => {
    const { prisma, created } = makeConsolidatePrisma({
      shipment: makeShipment(),
      newTourId: 't-new',
    });
    const svc = makeConsolidateSvc(prisma);
    jest.spyOn(svc, 'findBestMatchForShipment').mockResolvedValue([
      { tour_id: 't-nv', mode: 'nv', score: 95, factors: [], reason: '' },
    ] as any);

    const res = await svc.consolidateOrCreateFvTour('S-1');
    // NV-Match wird gefiltert → fällt durch zu create.
    expect(res.action).toBe('created');
    expect(created).toHaveLength(1);
  });

  it('hazmat-Sendung wird übersprungen wenn match-Sub kein ADR hat → create', async () => {
    let findFirstCall = 0;
    const prisma: any = {
      shipments: {
        findFirst: jest.fn().mockImplementation(() => {
          findFirstCall++;
          if (findFirstCall === 1) {
            return makeShipment({ is_hazmat: true });
          }
          return {
            id: 'S-1',
            tour_id: null,
            is_hazmat: true,
          };
        }),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tours: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === 't-no-adr') {
            return {
              id: 't-no-adr',
              status: 'planned',
              subcontractor_id: 'sub-no-adr',
              subcontractors: { has_adr_license: false },
              shipments: [],
            };
          }
          // Auto-created Tour (kein Sub).
          return {
            id: 't-new',
            status: 'planned',
            subcontractor_id: null,
            subcontractors: null,
            shipments: [],
          };
        }),
        create: jest.fn().mockResolvedValue({ id: 't-new' }),
      },
      users: { findFirst: jest.fn().mockResolvedValue({ id: 'u-1' }) },
    };
    const svc = makeConsolidateSvc(prisma);
    jest.spyOn(svc, 'findBestMatchForShipment').mockResolvedValue([
      {
        tour_id: 't-no-adr',
        mode: 'fv',
        score: 80,
        factors: [],
        reason: '',
      },
    ] as any);

    const res = await svc.consolidateOrCreateFvTour('S-1');
    // hazmat-Reject auf Match → Fallback zu Create (Sub=null,
    // hazmat-Block fired NICHT bei auto-create).
    expect(res.action).toBe('created');
    expect(res.tourId).toBe('t-new');
  });
});

// ═══ R2.2: checkAndAutoDispatch ════════════════════════════════
//
// "Voll" = fillRatio ≥ 0.9; Bedingung: subcontractor_id != null
// UND status='planned'. Sonst skip. Idempotent.

function makeAutoDispatchPrisma(tour: any) {
  const updates: any[] = [];
  return {
    prisma: {
      tours: {
        findUnique: jest.fn().mockResolvedValue(tour),
        update: jest.fn().mockImplementation((args: any) => {
          updates.push(args);
          return args.data;
        }),
      },
      shipments: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    },
    updates,
  };
}

describe('ToursService.checkAndAutoDispatch — bedingungen', () => {
  function buildTour(overrides: Partial<any> = {}) {
    return {
      id: 't-1',
      status: 'planned',
      subcontractor_id: 'sub-1',
      max_ldm: 13.6,
      max_weight_kg: 24000,
      shipments: [],
      ...overrides,
    };
  }

  it('skip wenn status nicht planned', async () => {
    const { prisma, updates } = makeAutoDispatchPrisma(
      buildTour({ status: 'dispatched', shipments: [{ ldm: 13, weight_kg: 23000 }] }),
    );
    const svc = makeConsolidateSvc(prisma);
    await svc.checkAndAutoDispatch('t-1');
    expect(updates).toHaveLength(0);
  });

  it('skip wenn subcontractor_id null (fahrerlos = kein Dispatch)', async () => {
    const { prisma, updates } = makeAutoDispatchPrisma(
      buildTour({
        subcontractor_id: null,
        shipments: [{ ldm: 13, weight_kg: 23000 }], // 96% full
      }),
    );
    const svc = makeConsolidateSvc(prisma);
    await svc.checkAndAutoDispatch('t-1');
    expect(updates).toHaveLength(0);
  });

  it('skip wenn fillRatio < 0.9 (LDM 50% + Weight 50%)', async () => {
    const { prisma, updates } = makeAutoDispatchPrisma(
      buildTour({
        shipments: [
          { ldm: 6.8, weight_kg: 12000 }, // ~50% beider Dimensionen
        ],
      }),
    );
    const svc = makeConsolidateSvc(prisma);
    await svc.checkAndAutoDispatch('t-1');
    expect(updates).toHaveLength(0);
  });

  it('dispatched wenn LDM-Ratio ≥ 0.9 + Sub gesetzt', async () => {
    const tour = buildTour({
      shipments: [{ ldm: 13, weight_kg: 8000 }], // ldm 96%, kg 33%
    });
    const { prisma } = makeAutoDispatchPrisma(tour);
    const svc = makeConsolidateSvc(prisma);
    // Spy auf dispatchTour — wir testen den Trigger, nicht den
    // dispatchTour-Internals (eigene Test-Surface).
    const dispatchSpy = jest
      .spyOn(svc, 'dispatchTour')
      .mockResolvedValue({} as any);

    await svc.checkAndAutoDispatch('t-1');
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('t-1');
  });

  it('dispatched wenn Weight-Ratio ≥ 0.9 + Sub gesetzt', async () => {
    const tour = buildTour({
      shipments: [{ ldm: 4, weight_kg: 22000 }], // ldm 29%, kg 91%
    });
    const { prisma } = makeAutoDispatchPrisma(tour);
    const svc = makeConsolidateSvc(prisma);
    const dispatchSpy = jest
      .spyOn(svc, 'dispatchTour')
      .mockResolvedValue({} as any);

    await svc.checkAndAutoDispatch('t-1');
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('NICHT dispatched wenn nur 89% (knapp unter Schwelle)', async () => {
    const tour = buildTour({
      shipments: [{ ldm: 12, weight_kg: 20000 }], // ldm 88%, kg 83%
    });
    const { prisma } = makeAutoDispatchPrisma(tour);
    const svc = makeConsolidateSvc(prisma);
    const dispatchSpy = jest
      .spyOn(svc, 'dispatchTour')
      .mockResolvedValue({} as any);

    await svc.checkAndAutoDispatch('t-1');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

// ═══ R2.2: recordHauptlaufCost ═════════════════════════════════
//
// Persistiert HAUPTLAUF-Kosten in shipment_cost_components mit
// nv_tour_id=NULL, phase='HAUPTLAUF', kapazitaet_anteil_eur=cost.

describe('ToursService.recordHauptlaufCost — persistence', () => {
  function makeCostsPrisma(opts: {
    mainCost?: number;
    existingComponent?: { id: string } | null;
  } = {}) {
    const componentWrites: Array<{ op: 'create' | 'update'; data: any }> = [];
    const prisma: any = {
      shipments: {
        findUnique: jest.fn().mockResolvedValue({
          main_carriage_cost: opts.mainCost ?? 250.5,
        }),
      },
      shipment_cost_components: {
        findUnique: jest.fn().mockResolvedValue(opts.existingComponent ?? null),
        create: jest.fn().mockImplementation((args: any) => {
          componentWrites.push({ op: 'create', data: args.data });
          return args.data;
        }),
        update: jest.fn().mockImplementation((args: any) => {
          componentWrites.push({ op: 'update', data: args.data });
          return args.data;
        }),
      },
    };
    return { prisma, componentWrites };
  }

  it('create-Pfad wenn noch kein HAUPTLAUF-Record existiert', async () => {
    const { prisma, componentWrites } = makeCostsPrisma({ mainCost: 320 });
    const svc = makeConsolidateSvc(prisma);
    (svc as any).costs = {
      calculateMainCarriageCost: jest.fn().mockResolvedValue(undefined),
    };
    await svc.recordHauptlaufCost('t-fv-1', 'S-1');
    expect(componentWrites).toHaveLength(1);
    expect(componentWrites[0].op).toBe('create');
    expect(componentWrites[0].data.phase).toBe('HAUPTLAUF');
    expect(componentWrites[0].data.nv_tour_id).toBeNull();
    expect(componentWrites[0].data.kapazitaet_anteil_eur).toBe(320);
    expect(componentWrites[0].data.faktoren.tour_id).toBe('t-fv-1');
    expect(componentWrites[0].data.faktoren.source).toBe('auto_consolidate');
  });

  it('update-Pfad wenn HAUPTLAUF-Record schon existiert (idempotent)', async () => {
    const { prisma, componentWrites } = makeCostsPrisma({
      mainCost: 410,
      existingComponent: { id: 'comp-1' },
    });
    const svc = makeConsolidateSvc(prisma);
    (svc as any).costs = {
      calculateMainCarriageCost: jest.fn().mockResolvedValue(undefined),
    };
    await svc.recordHauptlaufCost('t-fv-1', 'S-1');
    expect(componentWrites).toHaveLength(1);
    expect(componentWrites[0].op).toBe('update');
    expect(componentWrites[0].data.kapazitaet_anteil_eur).toBe(410);
  });

  it('cost=0 wenn calculateMainCarriageCost wirft (kein Rate vorhanden)', async () => {
    const { prisma, componentWrites } = makeCostsPrisma({ mainCost: 0 });
    const svc = makeConsolidateSvc(prisma);
    (svc as any).costs = {
      calculateMainCarriageCost: jest.fn().mockRejectedValue(new Error('no rate')),
    };
    await svc.recordHauptlaufCost('t-fv-1', 'S-1');
    // Trotz Fehler wird Marker-Record geschrieben.
    expect(componentWrites).toHaveLength(1);
    expect(componentWrites[0].data.kapazitaet_anteil_eur).toBe(0);
  });
});

// ═══ R2.4: Edge-Cases ═════════════════════════════════════════════
//
// race-safety, in_warehouse-ohne-nv-stop, dispatched-tour-blocker,
// dryRun-preview.

describe('ToursService — R2.4 Edge-Cases', () => {
  it('race-safe: tryLinkToFvTour updateMany count=0 → race_lost', async () => {
    const tour = {
      id: 't-1',
      status: 'planned',
      subcontractor_id: 'sub-1',
      subcontractors: { has_adr_license: true },
      shipments: [],
    };
    const prisma: any = {
      tours: { findUnique: jest.fn().mockResolvedValue(tour) },
      shipments: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'S-1',
          tour_id: null,
          is_hazmat: false,
        }),
        // count=0 simuliert: anderer paralleler Call hat schon
        // tour_id gesetzt → unsere updateMany matched nichts.
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const svc = makeConsolidateSvc(prisma);
    const res = await (svc as any).tryLinkToFvTour('t-1', 'S-1');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('race_lost');
  });

  it('race-safe success: updateMany count=1 → ok', async () => {
    const tour = {
      id: 't-1',
      status: 'planned',
      subcontractor_id: 'sub-1',
      subcontractors: { has_adr_license: true },
      shipments: [{ id: 'X', tour_position: 1 }],
    };
    const prisma: any = {
      tours: { findUnique: jest.fn().mockResolvedValue(tour) },
      shipments: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'S-1',
          tour_id: null,
          is_hazmat: false,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const svc = makeConsolidateSvc(prisma);
    const res = await (svc as any).tryLinkToFvTour('t-1', 'S-1');
    expect(res.ok).toBe(true);
    // tour_position = maxPos+1 = 2
    const updArgs = (prisma.shipments.updateMany as jest.Mock).mock
      .calls[0][0];
    expect(updArgs.where.tour_id).toBeNull();
    expect(updArgs.data.tour_position).toBe(2);
  });

  it('dispatched-Tour als Match wird mit reason=tour_not_planned gefiltert', async () => {
    const prisma: any = {
      tours: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't-disp',
          status: 'dispatched',
          subcontractor_id: 'sub',
          subcontractors: { has_adr_license: true },
          shipments: [],
        }),
      },
      shipments: { findFirst: jest.fn() },
    };
    const svc = makeConsolidateSvc(prisma);
    const res = await (svc as any).tryLinkToFvTour('t-disp', 'S-1');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('tour_not_planned');
    // findFirst (shipment) wurde GAR NICHT aufgerufen — Tour-Check
    // bricht früh ab.
    expect(prisma.shipments.findFirst).not.toHaveBeenCalled();
  });

  it('dryRunConsolidate: skipped wenn wrong_status (kein DB-write)', async () => {
    const prisma: any = {
      shipments: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'S-1',
          status: 'new',
          tour_id: null,
          classification: 'CHARTER_UMSCHLAG',
          has_active_lock: false,
          delivery_date: null,
        }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      tours: { findUnique: jest.fn() },
    };
    const svc = makeConsolidateSvc(prisma);
    const res = await svc.dryRunConsolidate('S-1');
    expect(res.action).toBe('skipped');
    expect(res.reason).toBe('wrong_status');
    expect(prisma.shipments.update).not.toHaveBeenCalled();
    expect(prisma.shipments.updateMany).not.toHaveBeenCalled();
  });

  it('dryRunConsolidate: candidates mit eligibility-Blockern', async () => {
    const shipment = {
      id: 'S-1',
      status: 'in_warehouse',
      tour_id: null,
      classification: 'CHARTER_UMSCHLAG',
      has_active_lock: false,
      delivery_date: null,
    };
    const prisma: any = {
      shipments: { findFirst: jest.fn().mockResolvedValue(shipment) },
      tours: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === 't-disp') {
            return {
              id: 't-disp',
              status: 'dispatched',
              tour_number: 'T-DISP-1',
            };
          }
          if (where.id === 't-planned') {
            return {
              id: 't-planned',
              status: 'planned',
              tour_number: 'T-PL-1',
            };
          }
          return null;
        }),
      },
    };
    const svc = makeConsolidateSvc(prisma);
    jest.spyOn(svc, 'findBestMatchForShipment').mockResolvedValue([
      { tour_id: 't-disp', mode: 'fv', score: 90, factors: [], reason: '' },
      { tour_id: 't-planned', mode: 'fv', score: 80, factors: [], reason: '' },
    ] as any);

    const res = await svc.dryRunConsolidate('S-1');
    // Erster eligible Match ist t-planned (t-disp blocked).
    expect(res.action).toBe('consolidated');
    expect(res.tourId).toBe('t-planned');
    expect(res.candidates).toHaveLength(2);
    const dispCand = res.candidates!.find((c) => c.tour_id === 't-disp');
    expect(dispCand?.eligible).toBe(false);
    expect(dispCand?.blocker).toBe('status_dispatched');
    const plannedCand = res.candidates!.find(
      (c) => c.tour_id === 't-planned',
    );
    expect(plannedCand?.eligible).toBe(true);
  });

  it('consolidateAllInWarehouse: returns pending-count, mutiert nicht synchron', async () => {
    const prisma: any = {
      shipments: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'S-1' },
          { id: 'S-2' },
          { id: 'S-3' },
        ]),
      },
    };
    const svc = makeConsolidateSvc(prisma);
    const consSpy = jest
      .spyOn(svc, 'consolidateOrCreateFvTour')
      .mockResolvedValue({ action: 'skipped' });

    const res = await svc.consolidateAllInWarehouse({ limit: 50 });
    expect(res.pending).toBe(3);
    expect(res.processed).toBe('background');
    // findMany sollte mit Filter CHARTER_UMSCHLAG + in_warehouse +
    // tour_id=null aufgerufen werden.
    const args = (prisma.shipments.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.status).toBe('in_warehouse');
    expect(args.where.classification).toBe('CHARTER_UMSCHLAG');
    expect(args.where.tour_id).toBeNull();
    // Synchron noch nicht aufgerufen (setImmediate); aber spätestens
    // im nächsten Tick.
    await new Promise((r) => setImmediate(r));
    expect(consSpy).toHaveBeenCalled();
  });
});

// ═══ R3-C: auto_consolidated-Flag in findAll ════════════════════
//
// Tours-Liste enricht jeden Tour-Row mit auto_consolidated:boolean.
// Quelle: shipment_cost_components.faktoren.source='auto_consolidate'
// für irgendeine Sendung der Tour.

describe('R3-C: findAll auto_consolidated-Flag', () => {
  function makeFindAllPrisma(opts: {
    tours: any[];
    autoConsolidatedTourIds: string[];
  }) {
    return {
      tours: {
        findMany: jest.fn().mockResolvedValue(opts.tours),
      },
      shipment_cost_components: {
        findMany: jest.fn().mockResolvedValue(
          opts.autoConsolidatedTourIds.map((tourId) => ({
            faktoren: { source: 'auto_consolidate', tour_id: tourId },
          })),
        ),
      },
    };
  }

  it('Tour mit auto-konsolidiert-Marker bekommt flag=true', async () => {
    const tours = [
      {
        id: 't-1',
        status: 'planned',
        shipments: [{ id: 'S-1', ldm: 5 }, { id: 'S-2', ldm: 4 }],
      },
      {
        id: 't-2',
        status: 'planned',
        shipments: [{ id: 'S-3', ldm: 3 }],
      },
    ];
    const prisma = makeFindAllPrisma({
      tours,
      autoConsolidatedTourIds: ['t-1'],
    });
    const svc = new ToursService(
      prisma as any,
      {} as any,
      { enrichToursWithReleaseBlockInfo: (rows: any[]) => rows } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const result: any = await svc.findAll({});
    expect(result.find((t: any) => t.id === 't-1').auto_consolidated).toBe(true);
    expect(result.find((t: any) => t.id === 't-2').auto_consolidated).toBe(false);
  });

  it('keine Sendungen → kein cost-components-Query, alle false', async () => {
    const prisma = makeFindAllPrisma({
      tours: [{ id: 't-empty', status: 'planned', shipments: [] }],
      autoConsolidatedTourIds: [],
    });
    const svc = new ToursService(
      prisma as any,
      {} as any,
      { enrichToursWithReleaseBlockInfo: (rows: any[]) => rows } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const result: any = await svc.findAll({});
    expect(result[0].auto_consolidated).toBe(false);
    expect(prisma.shipment_cost_components.findMany).not.toHaveBeenCalled();
  });
});

// ═══ R3-B: Auto-Hub-Set bei consolidateOrCreateFvTour ═══════════
//
// Wenn keine FV-Match → create new tour mit hub_start_address_id =
// Umschlag-WH-Address (ensureUmschlagAddressId).

describe('R3-B: consolidateOrCreateFvTour Auto-Hub-Set', () => {
  it('hub_start_address_id wird auf Umschlag-Address gesetzt bei Create', async () => {
    const { prisma, created } = makeConsolidatePrisma({
      shipment: makeShipment(),
      newTourId: 't-new',
    });
    const warehouses = {
      ensureUmschlagAddressId: jest.fn().mockResolvedValue('addr-umschlag-1'),
    };
    const svc = makeConsolidateSvc(prisma, { warehouses });
    jest.spyOn(svc, 'findBestMatchForShipment').mockResolvedValue([] as any);

    const res = await svc.consolidateOrCreateFvTour('S-1');
    expect(res.action).toBe('created');
    expect(warehouses.ensureUmschlagAddressId).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    expect(created[0].hub_start_address_id).toBe('addr-umschlag-1');
  });

  it('hub_start_address_id bleibt null wenn kein Umschlag-WH konfiguriert', async () => {
    const { prisma, created } = makeConsolidatePrisma({
      shipment: makeShipment(),
      newTourId: 't-new',
    });
    const warehouses = {
      ensureUmschlagAddressId: jest.fn().mockResolvedValue(null),
    };
    const svc = makeConsolidateSvc(prisma, { warehouses });
    jest.spyOn(svc, 'findBestMatchForShipment').mockResolvedValue([] as any);

    const res = await svc.consolidateOrCreateFvTour('S-1');
    expect(res.action).toBe('created');
    expect(created[0].hub_start_address_id).toBeNull();
  });

  it('ensureUmschlagAddressId NICHT aufgerufen wenn consolidate (kein Create)', async () => {
    const matchTour = {
      id: 't-match',
      status: 'planned',
      subcontractor_id: 'sub-1',
      subcontractors: { has_adr_license: true },
      shipments: [],
    };
    const { prisma } = makeConsolidatePrisma({
      shipment: makeShipment(),
      matchTour,
    });
    const warehouses = {
      ensureUmschlagAddressId: jest.fn().mockResolvedValue('addr-umschlag-1'),
    };
    const svc = makeConsolidateSvc(prisma, { warehouses });
    jest.spyOn(svc, 'findBestMatchForShipment').mockResolvedValue([
      { tour_id: 't-match', mode: 'fv', score: 85, factors: [], reason: '' },
    ] as any);

    const res = await svc.consolidateOrCreateFvTour('S-1');
    expect(res.action).toBe('consolidated');
    // ensureUmschlagAddressId NICHT aufgerufen — Tour existierte schon.
    expect(warehouses.ensureUmschlagAddressId).not.toHaveBeenCalled();
  });
});
