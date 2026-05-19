import {
  getNvPlzSet,
  plzMatchesNv,
  _clearNvPlzCache,
} from './nv-plz.lib';

function mockPrisma(rows: Array<{ plz_pattern: unknown }>) {
  return {
    nv_tour_gebiete: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
}

describe('nv-plz.lib', () => {
  beforeEach(() => _clearNvPlzCache());

  it('aggregiert Array<string> Pattern', async () => {
    const prisma = mockPrisma([
      { plz_pattern: ['70499', '71%'] },
      { plz_pattern: ['75123'] },
    ]);
    const set = await getNvPlzSet(prisma as any);
    expect(set.exact.has('70499')).toBe(true);
    expect(set.exact.has('75123')).toBe(true);
    expect(set.prefixes).toEqual(['71']);
  });

  it('aggregiert CSV-String Pattern', async () => {
    const prisma = mockPrisma([{ plz_pattern: '70499,72%,75123' }]);
    const set = await getNvPlzSet(prisma as any);
    expect(set.exact.has('70499')).toBe(true);
    expect(set.exact.has('75123')).toBe(true);
    expect(set.prefixes).toEqual(['72']);
  });

  it('plzMatchesNv: exact + prefix', () => {
    const set = { exact: new Set(['70499']), prefixes: ['71'] };
    expect(plzMatchesNv('70499', set)).toBe(true);
    expect(plzMatchesNv('71001', set)).toBe(true);
    expect(plzMatchesNv('71999', set)).toBe(true);
    expect(plzMatchesNv('80000', set)).toBe(false);
    expect(plzMatchesNv('', set)).toBe(false);
  });

  it('Cache: zweiter Call hit findMany NICHT', async () => {
    const prisma = mockPrisma([{ plz_pattern: ['70499'] }]);
    await getNvPlzSet(prisma as any);
    await getNvPlzSet(prisma as any);
    expect(prisma.nv_tour_gebiete.findMany).toHaveBeenCalledTimes(1);
  });
});
