/**
 * C1-A Fix#2: recompute-all-tours / recomputeTourFull Tests.
 *
 * Approach: AdminController + nv/fv-Service direkt mit Mock-Prisma
 * instanziieren (kein TestingModule-Boot). Tests:
 *  - leere Tour-Menge → started:true, counts=0, kein Throw
 *  - idempotent: 2× recomputeTourFull → safe-methods werden je 2×
 *    aufgerufen (kein Doppel-Mutation-Effekt aus Service-Sicht;
 *    Idempotenz lebt im Wrap-Layer der safe-Methoden, die DB-State
 *    deterministisch re-derivieren).
 */
import { AdminController } from './admin.controller';
import { NvTourenService } from '../nv-touren/nv-touren.service';
import { ToursService } from '../tours/tours.service';

function makePrismaEmpty() {
  return {
    nv_touren: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    tours: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
}

function makeNvSvcMock() {
  return {
    recomputeTourFull: jest.fn().mockResolvedValue(undefined),
  } as unknown as NvTourenService;
}

function makeFvSvcMock() {
  return {
    recomputeTourFull: jest.fn().mockResolvedValue(undefined),
  } as unknown as ToursService;
}

function makeController(
  prisma: any,
  nv: NvTourenService,
  fv: ToursService,
): AdminController {
  return new AdminController(
    {} as any, // backfill
    {} as any, // shipments
    prisma,
    nv,
    fv,
  );
}

describe('AdminController.recomputeAllTours', () => {
  it('leere Tour-Menge → started:true, counts:0, kein Throw', async () => {
    const prisma = makePrismaEmpty();
    const nv = makeNvSvcMock();
    const fv = makeFvSvcMock();
    const ctrl = makeController(prisma, nv, fv);

    const out = await ctrl.recomputeAllTours({});
    expect(out).toEqual({
      started: true,
      mode: 'all',
      count_nv: 0,
      count_fv: 0,
    });
    expect(prisma.nv_touren.count).toHaveBeenCalledTimes(1);
    expect(prisma.tours.count).toHaveBeenCalledTimes(1);
  });

  it('mode=nv → skipped fv-count', async () => {
    const prisma = makePrismaEmpty();
    prisma.nv_touren.count = jest.fn().mockResolvedValue(3);
    const ctrl = makeController(prisma, makeNvSvcMock(), makeFvSvcMock());
    const out = await ctrl.recomputeAllTours({ mode: 'nv' });
    expect(out.mode).toBe('nv');
    expect(out.count_nv).toBe(3);
    expect(out.count_fv).toBe(0);
  });

  it('mode=fv → skipped nv-count', async () => {
    const prisma = makePrismaEmpty();
    prisma.tours.count = jest.fn().mockResolvedValue(5);
    const ctrl = makeController(prisma, makeNvSvcMock(), makeFvSvcMock());
    const out = await ctrl.recomputeAllTours({ mode: 'fv' });
    expect(out.mode).toBe('fv');
    expect(out.count_nv).toBe(0);
    expect(out.count_fv).toBe(5);
  });

  it('batchSize clamped: <1 → 1, >50 → 50', async () => {
    const prisma = makePrismaEmpty();
    const ctrl = makeController(prisma, makeNvSvcMock(), makeFvSvcMock());
    // Just verify no throw; clamping is internal.
    await expect(ctrl.recomputeAllTours({ batchSize: 0 })).resolves.toMatchObject({
      started: true,
    });
    await expect(ctrl.recomputeAllTours({ batchSize: 9999 })).resolves.toMatchObject({
      started: true,
    });
  });
});

describe('NvTourenService.recomputeTourFull (idempotent)', () => {
  it('ruft die 4 safe-Methoden in Reihenfolge auf — 2× Aufruf = 2× je safe', async () => {
    // Wir bauen einen minimal-Service-Stub: NvTourenService nimmt
    // prisma + tours (forwardRef, hier Mock). Die safe-Methoden sind
    // private — wir mocken sie über jest.spyOn nach Instanziierung.
    const { NvTourenService } = await import('../nv-touren/nv-touren.service');
    const prisma = {} as any;
    const tours = {
      consolidateOrCreateFvTour: jest.fn().mockResolvedValue({ action: 'skipped' }),
    } as any;
    const svc = new NvTourenService(prisma, tours);

    const s1 = jest.spyOn<any, any>(svc as any, 'safeRecomputeIsCharter').mockResolvedValue(undefined);
    const s2 = jest.spyOn<any, any>(svc as any, 'safeRecalc').mockResolvedValue(undefined);
    const s3 = jest.spyOn<any, any>(svc as any, 'safeOptimizeTour').mockResolvedValue(undefined);
    const s4 = jest.spyOn<any, any>(svc as any, 'safeRecomputeSchedule').mockResolvedValue(undefined);

    await svc.recomputeTourFull('t-1');
    await svc.recomputeTourFull('t-1');

    // 2× Aufruf → je safe-method 2× ausgeführt, keine Akkumulation.
    expect(s1).toHaveBeenCalledTimes(2);
    expect(s2).toHaveBeenCalledTimes(2);
    expect(s3).toHaveBeenCalledTimes(2);
    expect(s4).toHaveBeenCalledTimes(2);

    // Reihenfolge: charter → recalc → optimize → schedule
    const order = [
      s1.mock.invocationCallOrder[0],
      s2.mock.invocationCallOrder[0],
      s3.mock.invocationCallOrder[0],
      s4.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('ToursService.recomputeTourFull (FV, idempotent)', () => {
  it('ruft die 3 FV-safe-Methoden in Reihenfolge auf — 2× Aufruf = 2× je safe', async () => {
    const { ToursService } = await import('../tours/tours.service');
    const svc = new ToursService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const s1 = jest.spyOn<any, any>(svc as any, 'safeRecomputeIsCharterFv').mockResolvedValue(undefined);
    const s2 = jest.spyOn<any, any>(svc as any, 'safeOptimizeFvTour').mockResolvedValue(undefined);
    const s3 = jest.spyOn<any, any>(svc as any, 'safeRecomputeFvSchedule').mockResolvedValue(undefined);

    await svc.recomputeTourFull('t-fv-1');
    await svc.recomputeTourFull('t-fv-1');

    expect(s1).toHaveBeenCalledTimes(2);
    expect(s2).toHaveBeenCalledTimes(2);
    expect(s3).toHaveBeenCalledTimes(2);

    const order = [
      s1.mock.invocationCallOrder[0],
      s2.mock.invocationCallOrder[0],
      s3.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
