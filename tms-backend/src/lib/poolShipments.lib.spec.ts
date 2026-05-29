/**
 * E2: Tests fuer poolShipments.lib — Stufe 1 (NV-pickup/-delivery,
 * FV-Sammelgut). Mock-Prisma analog nv-plz.lib.spec.ts.
 *
 * Scope:
 *   · Mode-Routing (nv-* → NV-Pfad, fv-sammelgut → FV-Pfad).
 *   · Anker-Bildung mit country|prefix (kein Schneeball).
 *   · Edge: leerer Anker → leerer Pool.
 *   · FV-Sammelgut ohne relation.network_partner_id → ausgeschlossen.
 *   · Cap-Default 500.
 *   · isNvPoolMode / isFvPoolMode Helper.
 */
import {
  isFvPoolMode,
  isNvPoolMode,
  NV_PREFIX_DIGITS_DEFAULT,
  POOL_CAP_DEFAULT,
  resolvePool,
} from './poolShipments.lib';

function makeShipmentRow(overrides: Partial<any> = {}) {
  return {
    id: 's1',
    shipment_number: 'S-001',
    status: 'new',
    transport_type: 'DIREKT',
    weight_kg: 100,
    ldm: 0.5,
    volume_m3: 1.2,
    customers: { name: 'Kunde A' },
    addresses_shipments_loading_address_idToaddresses: {
      zip: '70435',
      city: 'Stuttgart',
      country_code: 'DE',
    },
    addresses_shipments_delivery_address_idToaddresses: {
      zip: '80331',
      city: 'Muenchen',
      country_code: 'DE',
    },
    relation: null,
    ...overrides,
  };
}

describe('poolShipments.lib — mode validators', () => {
  it('isNvPoolMode akzeptiert NV-Modi, rejectet rest', () => {
    expect(isNvPoolMode('nv-pickup')).toBe(true);
    expect(isNvPoolMode('nv-delivery')).toBe(true);
    expect(isNvPoolMode('fv-sammelgut')).toBe(false);
    expect(isNvPoolMode('pickup')).toBe(false);
    expect(isNvPoolMode(undefined)).toBe(false);
    expect(isNvPoolMode(null)).toBe(false);
  });
  it('isFvPoolMode akzeptiert nur fv-sammelgut', () => {
    expect(isFvPoolMode('fv-sammelgut')).toBe(true);
    expect(isFvPoolMode('nv-pickup')).toBe(false);
    expect(isFvPoolMode('FV-Sammelgut')).toBe(false);
  });
});

describe('poolShipments.lib — resolvePool (nv-pickup)', () => {
  it('Anker aus PICKUP-Stops, status=new, loading-Adresse-Filter', async () => {
    const findManyMock = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's2',
        shipment_number: 'S-002',
        status: 'new',
      }),
    ]);
    const prisma = {
      nv_touren: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          stops: [
            {
              stop_type: 'PICKUP',
              shipment: {
                addresses_shipments_loading_address_idToaddresses: {
                  zip: '70499',
                  country_code: 'DE',
                },
                addresses_shipments_delivery_address_idToaddresses: null,
              },
            },
          ],
        }),
      },
      shipments: { findMany: findManyMock },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 's2',
      anchor_zip: '70435', // loading-zip aus dem mock-Shipment
      anchor_country: 'DE',
      depot_id: null,
    });
    // Tour-Load mit stop_type=PICKUP-Filter.
    expect(prisma.nv_touren.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        select: expect.objectContaining({
          stops: expect.objectContaining({
            where: { stop_type: 'PICKUP' },
          }),
        }),
      }),
    );
    // Pool-Query: status=new + loading-Adresse-Filter mit
    // 3-stelligem Praefix + country 'DE'.
    const callArg = findManyMock.mock.calls[0][0];
    expect(callArg.where.status).toBe('new');
    expect(callArg.where.tour_id).toBeNull();
    const addrFilter =
      callArg.where.addresses_shipments_loading_address_idToaddresses;
    expect(addrFilter.OR).toEqual([
      { country_code: 'DE', zip: { startsWith: '704' } },
    ]);
    expect(callArg.take).toBe(POOL_CAP_DEFAULT);
  });

  it('mehrere PICKUP-Stops → Anker-Set deduped + multi-OR', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const prisma = {
      nv_touren: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          stops: [
            mkStop('PICKUP', '70499', 'DE'),
            mkStop('PICKUP', '70499', 'DE'), // duplicate → dedup
            mkStop('PICKUP', '80331', 'DE'),
            mkStop('PICKUP', '1100', 'AT'),
          ],
        }),
      },
      shipments: { findMany: findManyMock },
    };
    await resolvePool(prisma as any, 't1', 'nv-pickup');
    const or =
      findManyMock.mock.calls[0][0].where
        .addresses_shipments_loading_address_idToaddresses.OR;
    expect(or).toHaveLength(3); // 704/DE, 803/DE, 110/AT
    expect(or).toEqual(
      expect.arrayContaining([
        { country_code: 'DE', zip: { startsWith: '704' } },
        { country_code: 'DE', zip: { startsWith: '803' } },
        { country_code: 'AT', zip: { startsWith: '110' } },
      ]),
    );
  });

  it('leere Anker (keine Stops) → leerer Pool, KEINE shipments-Query', async () => {
    const findManyMock = jest.fn();
    const prisma = {
      nv_touren: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 't1', stops: [] }),
      },
      shipments: { findMany: findManyMock },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('opts.prefixDigits ueberschreibt Default', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const prisma = {
      nv_touren: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 't1', stops: [mkStop('PICKUP', '70499', 'DE')] }),
      },
      shipments: { findMany: findManyMock },
    };
    await resolvePool(prisma as any, 't1', 'nv-pickup', { prefixDigits: 2 });
    const or =
      findManyMock.mock.calls[0][0].where
        .addresses_shipments_loading_address_idToaddresses.OR;
    expect(or[0].zip.startsWith).toBe('70');
  });

  it('Tour nicht gefunden → Error', async () => {
    const prisma = {
      nv_touren: { findUnique: jest.fn().mockResolvedValue(null) },
      shipments: { findMany: jest.fn() },
    };
    await expect(
      resolvePool(prisma as any, 't1', 'nv-pickup'),
    ).rejects.toThrow('Tour nicht gefunden');
  });
});

describe('poolShipments.lib — resolvePool (nv-delivery)', () => {
  it('Anker aus DELIVERY-Stops, status=in_warehouse, delivery-Adresse-Filter', async () => {
    const findManyMock = jest.fn().mockResolvedValue([
      makeShipmentRow({ id: 's3', status: 'in_warehouse' }),
    ]);
    const prisma = {
      nv_touren: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          stops: [
            {
              stop_type: 'DELIVERY',
              shipment: {
                addresses_shipments_loading_address_idToaddresses: null,
                addresses_shipments_delivery_address_idToaddresses: {
                  zip: '60311',
                  country_code: 'DE',
                },
              },
            },
          ],
        }),
      },
      shipments: { findMany: findManyMock },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-delivery');
    expect(out).toHaveLength(1);
    expect(out[0].anchor_zip).toBe('80331'); // delivery-zip aus mock
    expect(out[0].anchor_country).toBe('DE');
    expect(prisma.nv_touren.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          stops: expect.objectContaining({
            where: { stop_type: 'DELIVERY' },
          }),
        }),
      }),
    );
    const callArg = findManyMock.mock.calls[0][0];
    expect(callArg.where.status).toBe('in_warehouse');
    expect(
      callArg.where.addresses_shipments_delivery_address_idToaddresses.OR,
    ).toEqual([{ country_code: 'DE', zip: { startsWith: '603' } }]);
    // KEIN loading-Adresse-Filter im DELIVERY-Modus
    expect(
      callArg.where.addresses_shipments_loading_address_idToaddresses,
    ).toBeUndefined();
  });
});

describe('poolShipments.lib — resolvePool (fv-sammelgut)', () => {
  it('Anker aus relation.network_partner_id (distinct), Pool=SAMMELGUT', async () => {
    const findManyMock = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-sg',
        transport_type: 'SAMMELGUT',
        status: 'in_warehouse',
        relation: {
          network_partner_id: 'np-A',
          network_partner: {
            id: 'np-A',
            name: 'Depot Frankfurt',
            partner_number: 'DEPOT-FRA',
          },
        },
      }),
    ]);
    const prisma = {
      tours: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          shipments: [
            { relation: { network_partner_id: 'np-A' } },
            { relation: { network_partner_id: 'np-B' } },
            { relation: { network_partner_id: 'np-A' } }, // dedup
            { relation: { network_partner_id: null } },   // ignore
            { relation: null },                            // ignore
          ],
        }),
      },
      shipments: { findMany: findManyMock },
    };
    const out = await resolvePool(prisma as any, 't1', 'fv-sammelgut');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 's-sg',
      depot_id: 'np-A',
      depot_name: 'Depot Frankfurt',
      depot_number: 'DEPOT-FRA',
      anchor_zip: '80331', // delivery (nicht-pickup → delivery-Adresse)
    });
    const callArg = findManyMock.mock.calls[0][0];
    expect(callArg.where.status).toBe('in_warehouse');
    expect(callArg.where.transport_type).toBe('SAMMELGUT');
    expect(callArg.where.tour_id).toBeNull();
    expect(callArg.where.relation.network_partner_id.in.sort()).toEqual(
      ['np-A', 'np-B'].sort(),
    );
  });

  it('keine Tour-Sendungen mit network_partner_id → leerer Pool, keine shipments-Query', async () => {
    const findManyMock = jest.fn();
    const prisma = {
      tours: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          shipments: [
            { relation: { network_partner_id: null } },
            { relation: null },
          ],
        }),
      },
      shipments: { findMany: findManyMock },
    };
    const out = await resolvePool(prisma as any, 't1', 'fv-sammelgut');
    expect(out).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('Tour nicht gefunden → Error', async () => {
    const prisma = {
      tours: { findUnique: jest.fn().mockResolvedValue(null) },
      shipments: { findMany: jest.fn() },
    };
    await expect(
      resolvePool(prisma as any, 't1', 'fv-sammelgut'),
    ).rejects.toThrow('Tour nicht gefunden');
  });
});

describe('poolShipments.lib — Defaults', () => {
  it('Default-Praefix=3, Default-Cap=500', () => {
    expect(NV_PREFIX_DIGITS_DEFAULT).toBe(3);
    expect(POOL_CAP_DEFAULT).toBe(500);
  });
});

// ─── helpers ──────────────────────────────────────────────────

function mkStop(stop_type: 'PICKUP' | 'DELIVERY', zip: string, country_code: string) {
  return {
    stop_type,
    shipment: {
      addresses_shipments_loading_address_idToaddresses:
        stop_type === 'PICKUP' ? { zip, country_code } : null,
      addresses_shipments_delivery_address_idToaddresses:
        stop_type === 'DELIVERY' ? { zip, country_code } : null,
    },
  };
}
