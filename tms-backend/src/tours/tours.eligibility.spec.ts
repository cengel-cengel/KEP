/**
 * P0-7: Regression-Coverage für eligibleShipmentsFv-WHERE.
 * Sicherstellt:
 *   • FV_TRANSPORT_TYPES enthält alle 7 erwarteten Werte
 *   • WHERE-Clause filtert transport_type über die Liste
 *   • OR-Branch 1 prüft stop_type='PICKUP' UND tour.COMPLETED (P0-6)
 *   • OR-Branch 2 prüft partner_delivered=true
 *   • OR-Branch 3 deckt outside-NV-Gebiet ab (Charter)
 *
 * Approach: Service-Instanz mit mocked PrismaService.
 * Captured WHERE-Arg wird auf Struktur-Properties geprüft.
 */
import { ToursService, FV_TRANSPORT_TYPES } from './tours.service';
import { _clearNvPlzCache } from '../lib/nv-plz.lib';

interface CapturedQuery {
  where?: any;
}

function makeMockPrisma() {
  const calls: { shipmentsFindMany: CapturedQuery[] } = {
    shipmentsFindMany: [],
  };
  const prisma: any = {
    relations: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'rel-1' },
        { id: 'rel-2' },
      ]),
    },
    nv_tour_gebiete: {
      findMany: jest.fn().mockResolvedValue([
        { plz_pattern: ['70%', '71499'] },
      ]),
    },
    shipments: {
      findMany: jest.fn().mockImplementation(async (args: any) => {
        calls.shipmentsFindMany.push(args);
        return [];
      }),
    },
  };
  return { prisma, calls };
}

function makeService(prisma: any): ToursService {
  return new ToursService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe('FV_TRANSPORT_TYPES', () => {
  it('enthält alle 7 erwarteten Typen (P0-7 Coverage)', () => {
    expect(FV_TRANSPORT_TYPES).toEqual([
      'SAMMELGUT',
      'TEILLADUNG',
      'KOMPLETTLADUNG',
      'DIREKT',
      'DIREKT_UMSCHLAG',
      'BEILADER',
      'SONDER',
    ]);
  });

  it.each([
    'DIREKT',
    'DIREKT_UMSCHLAG',
    'BEILADER',
    'SONDER',
  ])('FV-fähig: %s', (t) => {
    expect(FV_TRANSPORT_TYPES).toContain(t);
  });

  it.each(['ABHOLUNG_UMSCHLAG', 'SELBST'])(
    'EXPLIZIT NICHT-FV: %s',
    (t) => {
      expect(FV_TRANSPORT_TYPES).not.toContain(t);
    },
  );
});

describe('eligibleShipmentsFv WHERE-Struktur', () => {
  beforeEach(() => _clearNvPlzCache());

  it('filtert transport_type über FV_TRANSPORT_TYPES', async () => {
    const { prisma, calls } = makeMockPrisma();
    const svc = makeService(prisma);
    await svc.eligibleShipmentsFv({});
    expect(calls.shipmentsFindMany).toHaveLength(1);
    const where = calls.shipmentsFindMany[0].where;
    expect(where.transport_type).toEqual({
      in: [...FV_TRANSPORT_TYPES],
    });
  });

  it('verlangt status ∈ {new, in_warehouse} + tour_id=null + deleted_at=null', async () => {
    const { prisma, calls } = makeMockPrisma();
    await makeService(prisma).eligibleShipmentsFv({});
    const where = calls.shipmentsFindMany[0].where;
    // P0-6.5: status sowohl 'new' (Charter direkt) als auch
    // 'in_warehouse' (NV-PICKUP-completed)
    expect(where.status).toEqual({ in: ['new', 'in_warehouse'] });
    expect(where.tour_id).toBeNull();
    expect(where.deleted_at).toBeNull();
  });

  it('OR-Branch 1: stop_type=PICKUP + nv_touren.status=COMPLETED', async () => {
    const { prisma, calls } = makeMockPrisma();
    await makeService(prisma).eligibleShipmentsFv({});
    const where = calls.shipmentsFindMany[0].where;
    const orList = where.AND?.[0]?.OR ?? [];
    const branch1 = orList[0];
    // Strukturell: AND mit nv_tour_stops.some.stop_type='PICKUP'
    const stopFilter = branch1?.AND?.find(
      (a: any) => a.nv_tour_stops?.some,
    );
    expect(stopFilter?.nv_tour_stops?.some?.stop_type).toBe('PICKUP');
    expect(stopFilter?.nv_tour_stops?.some?.nv_touren?.status).toBe(
      'COMPLETED',
    );
  });

  it('OR-Branch 2: partner_delivered=true', async () => {
    const { prisma, calls } = makeMockPrisma();
    await makeService(prisma).eligibleShipmentsFv({});
    const where = calls.shipmentsFindMany[0].where;
    const orList = where.AND?.[0]?.OR ?? [];
    const branch2 = orList[1];
    const partnerFilter = branch2?.AND?.find(
      (a: any) => a.partner_delivered !== undefined,
    );
    expect(partnerFilter?.partner_delivered).toBe(true);
  });

  it('OR-Branch 3: Charter — loading_address outside NV-Gebiet', async () => {
    const { prisma, calls } = makeMockPrisma();
    await makeService(prisma).eligibleShipmentsFv({});
    const where = calls.shipmentsFindMany[0].where;
    const orList = where.AND?.[0]?.OR ?? [];
    const branch3 = orList[2];
    const addrFilter =
      branch3?.addresses_shipments_loading_address_idToaddresses;
    expect(addrFilter).toBeTruthy();
    // outsideNvGebiet hat AND: [{zip:{notIn:[...]}}, ...NOT-startsWith-Prefixes]
    expect(addrFilter.AND).toBeDefined();
    const notInClause = addrFilter.AND.find((a: any) => a.zip?.notIn);
    expect(notInClause?.zip?.notIn).toContain('71499');
  });

  it('leerer fvRelations-Set → leere Antwort, kein findMany-Call', async () => {
    const { prisma, calls } = makeMockPrisma();
    prisma.relations.findMany.mockResolvedValueOnce([]);
    _clearNvPlzCache();
    // fvRelationsCache lives on service-instance, fresh service:
    const svc = makeService(prisma);
    const out = await svc.eligibleShipmentsFv({});
    expect(out).toEqual([]);
    expect(calls.shipmentsFindMany).toHaveLength(0);
  });
});
