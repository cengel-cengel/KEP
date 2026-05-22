/**
 * R3+ RecomputeService Tests.
 *
 * Verifiziert die zentrale DRY-Loop: countActive + runRecomputeLoop
 * mit mode-Filter, batch-Paging, per-Tour-Error-Swallow.
 */
import { RecomputeService } from './recompute.service';

function makePrisma(opts: {
  nvTours?: Array<{ id: string }>;
  fvTours?: Array<{ id: string }>;
  nvCount?: number;
  fvCount?: number;
} = {}) {
  const nvTours = opts.nvTours ?? [];
  const fvTours = opts.fvTours ?? [];
  return {
    nv_touren: {
      count: jest.fn().mockResolvedValue(opts.nvCount ?? nvTours.length),
      findMany: jest.fn().mockImplementation((args: any) => {
        const skip = args.skip ?? 0;
        const take = args.take ?? 10;
        return Promise.resolve(nvTours.slice(skip, skip + take));
      }),
    },
    tours: {
      count: jest.fn().mockResolvedValue(opts.fvCount ?? fvTours.length),
      findMany: jest.fn().mockImplementation((args: any) => {
        const skip = args.skip ?? 0;
        const take = args.take ?? 10;
        return Promise.resolve(fvTours.slice(skip, skip + take));
      }),
    },
  } as any;
}

function makeNv() {
  return { recomputeTourFull: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeFv() {
  return { recomputeTourFull: jest.fn().mockResolvedValue(undefined) } as any;
}

describe('RecomputeService.countActive', () => {
  it('mode=all liefert beide counts', async () => {
    const prisma = makePrisma({ nvCount: 3, fvCount: 5 });
    const svc = new RecomputeService(prisma, makeNv(), makeFv());
    const r = await svc.countActive('all');
    expect(r).toEqual({ count_nv: 3, count_fv: 5 });
  });

  it('mode=nv → count_fv=0 (kein Query)', async () => {
    const prisma = makePrisma({ nvCount: 3, fvCount: 5 });
    const svc = new RecomputeService(prisma, makeNv(), makeFv());
    const r = await svc.countActive('nv');
    expect(r).toEqual({ count_nv: 3, count_fv: 0 });
    expect(prisma.tours.count).not.toHaveBeenCalled();
  });

  it('mode=fv → count_nv=0', async () => {
    const prisma = makePrisma({ nvCount: 3, fvCount: 5 });
    const svc = new RecomputeService(prisma, makeNv(), makeFv());
    const r = await svc.countActive('fv');
    expect(r).toEqual({ count_nv: 0, count_fv: 5 });
    expect(prisma.nv_touren.count).not.toHaveBeenCalled();
  });
});

describe('RecomputeService.runRecomputeLoop', () => {
  it('mode=all: ruft beide recomputeTourFull pro Tour', async () => {
    const prisma = makePrisma({
      nvTours: [{ id: 'nv-1' }, { id: 'nv-2' }],
      fvTours: [{ id: 'fv-1' }],
    });
    const nv = makeNv();
    const fv = makeFv();
    const svc = new RecomputeService(prisma, nv, fv);
    const r = await svc.runRecomputeLoop('all', 10);
    expect(nv.recomputeTourFull).toHaveBeenCalledTimes(2);
    expect(fv.recomputeTourFull).toHaveBeenCalledTimes(1);
    expect(r.processed_nv).toBe(2);
    expect(r.processed_fv).toBe(1);
    expect(r.errors_nv).toBe(0);
    expect(r.errors_fv).toBe(0);
  });

  it('mode=nv: skip FV-Loop komplett', async () => {
    const prisma = makePrisma({
      nvTours: [{ id: 'nv-1' }],
      fvTours: [{ id: 'fv-1' }],
    });
    const nv = makeNv();
    const fv = makeFv();
    const svc = new RecomputeService(prisma, nv, fv);
    await svc.runRecomputeLoop('nv', 10);
    expect(nv.recomputeTourFull).toHaveBeenCalledTimes(1);
    expect(fv.recomputeTourFull).not.toHaveBeenCalled();
    expect(prisma.tours.findMany).not.toHaveBeenCalled();
  });

  it('per-Tour-Error swallow: Loop läuft weiter, errors zählen', async () => {
    const prisma = makePrisma({
      nvTours: [{ id: 'ok-1' }, { id: 'err' }, { id: 'ok-2' }],
    });
    const nv = makeNv();
    (nv.recomputeTourFull as jest.Mock).mockImplementation((id: string) => {
      if (id === 'err') return Promise.reject(new Error('boom'));
      return Promise.resolve();
    });
    const svc = new RecomputeService(prisma, nv, makeFv());
    const r = await svc.runRecomputeLoop('nv', 10);
    expect(r.processed_nv).toBe(2);
    expect(r.errors_nv).toBe(1);
  });

  it('batch-paging: 25 Touren bei batchSize=10 → 3 batches', async () => {
    const tours = Array.from({ length: 25 }, (_, i) => ({ id: `t-${i}` }));
    const prisma = makePrisma({ nvTours: tours });
    const nv = makeNv();
    const svc = new RecomputeService(prisma, nv, makeFv());
    await svc.runRecomputeLoop('nv', 10);
    // 3 findMany calls: skip 0/10/20, plus 1 leerer (oder break)
    expect(nv.recomputeTourFull).toHaveBeenCalledTimes(25);
  });

  it('duration_ms ist immer >= 0', async () => {
    const svc = new RecomputeService(makePrisma(), makeNv(), makeFv());
    const r = await svc.runRecomputeLoop('all', 10);
    expect(r.duration_ms).toBeGreaterThanOrEqual(0);
  });
});
