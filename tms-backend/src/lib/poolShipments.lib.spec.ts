/**
 * E2+E3: Tests fuer poolShipments.lib — Stufe 1 (NV-pickup/-delivery,
 * FV-Sammelgut) + Shape-Parity-Mapper. Mock-Prisma analog
 * nv-plz.lib.spec.ts.
 *
 * Scope:
 *   · Mode-Routing (nv-* → NV-Pfad, fv-sammelgut → FV-Pfad).
 *   · Anker-Bildung mit country|prefix (kein Schneeball).
 *   · Anker-Adresse je Modus: pickup→loading, delivery→delivery.
 *   · Edge: leerer Anker → leerer Pool.
 *   · FV-Sammelgut ohne relation.network_partner_id → ausgeschlossen.
 *   · Cap-Default 500.
 *   · mapShipmentToPoolItem: Shape-Parity inkl. package_items,
 *     FV-Felder via withFvFields.
 *   · isNvPoolMode / isFvPoolMode Helper.
 */
import {
  isFvPoolMode,
  isNvPoolMode,
  mapShipmentToPoolItem,
  NV_PREFIX_DIGITS_DEFAULT,
  POOL_CAP_DEFAULT,
  resolvePool,
} from './poolShipments.lib';

function makeShipmentRow(overrides: Partial<any> = {}) {
  return {
    id: 's1',
    shipment_number: 'S-001',
    transport_type: 'DIREKT',
    weight_kg: 100,
    ldm: 0.5,
    volume_m3: 1.2,
    length_cm: 120,
    width_cm: 80,
    height_cm: 100,
    effective_pallets: 1,
    customers: { name: 'Kunde A' },
    addresses_shipments_loading_address_idToaddresses: {
      lat: 48.78,
      lng: 9.18,
      zip: '70435',
      city: 'Stuttgart',
      street: 'Teststr. 1',
      country_code: 'DE',
    },
    addresses_shipments_delivery_address_idToaddresses: {
      lat: 48.13,
      lng: 11.58,
      zip: '80331',
      city: 'Muenchen',
      street: 'Marienpl. 1',
      country_code: 'DE',
    },
    relation_id: null,
    relation: null,
    shipment_package_items: [
      {
        id: 'pi1',
        length_cm: 120,
        width_cm: 80,
        height_cm: 100,
        weight_kg: 50,
        quantity: 2,
        stackable: true,
      },
    ],
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

describe('poolShipments.lib — mapShipmentToPoolItem (Shape-Parity)', () => {
  it('anchor=loading: zip/city/lat/lng = loading-Adresse', () => {
    const out = mapShipmentToPoolItem(makeShipmentRow(), {
      anchor: 'loading',
    });
    expect(out).toMatchObject({
      id: 's1',
      shipment_number: 'S-001',
      weight_kg: 100,
      ldm: 0.5,
      volume_m3: 1.2,
      length_cm: 120,
      width_cm: 80,
      height_cm: 100,
      effective_pallets: 1,
      customer_name: 'Kunde A',
      lat: 48.78,
      lng: 9.18,
      zip: '70435',
      city: 'Stuttgart',
      loading_street: 'Teststr. 1',
      loading_country: 'DE',
      distance_km: 0,
      // FV-Felder ohne withFvFields = null
      transport_type: null,
      delivery_zip: null,
      delivery_city: null,
      delivery_country: null,
      relation_id: null,
      relation_code: null,
      depot_label: null,
    });
    expect(out.package_items).toEqual([
      {
        id: 'pi1',
        length_cm: 120,
        width_cm: 80,
        height_cm: 100,
        weight_kg: 50,
        quantity: 2,
        stackable: true,
      },
    ]);
  });
  it('anchor=delivery: zip/city/lat/lng = delivery-Adresse, loading_street bleibt loading', () => {
    const out = mapShipmentToPoolItem(makeShipmentRow(), {
      anchor: 'delivery',
    });
    expect(out.zip).toBe('80331');
    expect(out.city).toBe('Muenchen');
    expect(out.lat).toBe(48.13);
    expect(out.lng).toBe(11.58);
    // loading_street/loading_country IMMER aus loading-Adresse (wie nearby)
    expect(out.loading_street).toBe('Teststr. 1');
    expect(out.loading_country).toBe('DE');
  });
  it('withFvFields=true: transport_type + delivery_* + relation_* + depot_label gesetzt', () => {
    const row = makeShipmentRow({
      transport_type: 'SAMMELGUT',
      relation_id: 'r1',
      relation: {
        code: 'FRA-STR',
        network_partner_id: 'np1',
        network_partner: {
          id: 'np1',
          name: 'Depot Frankfurt',
          partner_number: 'DEPOT-FRA',
        },
        default_hall_location: {
          code: 'FRA-HALL',
          description: 'Halle Frankfurt',
        },
      },
    });
    const out = mapShipmentToPoolItem(row, {
      anchor: 'loading',
      withFvFields: true,
    });
    expect(out.transport_type).toBe('SAMMELGUT');
    expect(out.delivery_zip).toBe('80331');
    expect(out.delivery_city).toBe('Muenchen');
    expect(out.delivery_country).toBe('DE');
    expect(out.relation_id).toBe('r1');
    expect(out.relation_code).toBe('FRA-STR');
    // depot_label bevorzugt hall_location.description, fallback code, fallback network_partner.name
    expect(out.depot_label).toBe('Halle Frankfurt');
  });
  it('withFvFields + nur network_partner (kein hall_location) → depot_label = partner.name', () => {
    const row = makeShipmentRow({
      relation: {
        code: 'X',
        network_partner_id: 'np1',
        network_partner: { id: 'np1', name: 'Depot X', partner_number: 'X' },
        default_hall_location: null,
      },
    });
    const out = mapShipmentToPoolItem(row, {
      anchor: 'loading',
      withFvFields: true,
    });
    expect(out.depot_label).toBe('Depot X');
  });
  it('distance_km wird durchgereicht (nearby-Pfad)', () => {
    const out = mapShipmentToPoolItem(makeShipmentRow(), {
      anchor: 'loading',
      distance_km: 12.3,
    });
    expect(out.distance_km).toBe(12.3);
  });
  it('fehlende Anker-Adresse → lat/lng=0, zip/city=null', () => {
    const row = makeShipmentRow({
      addresses_shipments_delivery_address_idToaddresses: null,
    });
    const out = mapShipmentToPoolItem(row, { anchor: 'delivery' });
    expect(out.lat).toBe(0);
    expect(out.lng).toBe(0);
    expect(out.zip).toBeNull();
    expect(out.city).toBeNull();
  });
});

describe('poolShipments.lib — resolvePool (nv-pickup)', () => {
  it('Anker aus PICKUP-Stops, status=new, loading-Adresse-Filter, anchor=loading', async () => {
    const findManyMock = jest.fn().mockResolvedValue([
      makeShipmentRow({ id: 's2', shipment_number: 'S-002' }),
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
    // anchor=loading: zip aus loading-Adresse des Items
    expect(out[0]).toMatchObject({
      id: 's2',
      zip: '70435',
      lat: 48.78,
    });
    // package_items mitgeliefert
    expect(out[0].package_items).toHaveLength(1);
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
            mkStop('PICKUP', '70499', 'DE'),
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
    expect(or).toHaveLength(3);
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
        findUnique: jest.fn().mockResolvedValue({ id: 't1', stops: [] }),
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
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          stops: [mkStop('PICKUP', '70499', 'DE')],
        }),
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
  it('Anker aus DELIVERY-Stops, status=in_warehouse, delivery-Adresse-Filter, anchor=delivery', async () => {
    const findManyMock = jest
      .fn()
      .mockResolvedValue([makeShipmentRow({ id: 's3' })]);
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
    // anchor=delivery: zip/city/lat/lng aus delivery-Adresse
    expect(out[0]).toMatchObject({
      zip: '80331',
      city: 'Muenchen',
      lat: 48.13,
      lng: 11.58,
      // loading_street bleibt loading
      loading_street: 'Teststr. 1',
      loading_country: 'DE',
    });
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
    expect(
      callArg.where.addresses_shipments_loading_address_idToaddresses,
    ).toBeUndefined();
  });
});

describe('poolShipments.lib — resolvePool (fv-sammelgut)', () => {
  it('Anker aus relation.network_partner_id (distinct), Pool=SAMMELGUT, FV-Felder befuellt', async () => {
    const findManyMock = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-sg',
        transport_type: 'SAMMELGUT',
        relation_id: 'r1',
        relation: {
          code: 'FRA-STR',
          network_partner_id: 'np-A',
          network_partner: {
            id: 'np-A',
            name: 'Depot Frankfurt',
            partner_number: 'DEPOT-FRA',
          },
          default_hall_location: {
            code: 'FRA-HALL',
            description: 'Halle Frankfurt',
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
            { relation: { network_partner_id: 'np-A' } },
            { relation: { network_partner_id: null } },
            { relation: null },
          ],
        }),
      },
      shipments: { findMany: findManyMock },
    };
    const out = await resolvePool(prisma as any, 't1', 'fv-sammelgut');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 's-sg',
      // anchor=loading bei fv-sammelgut
      zip: '70435',
      city: 'Stuttgart',
      transport_type: 'SAMMELGUT',
      delivery_zip: '80331',
      delivery_city: 'Muenchen',
      delivery_country: 'DE',
      relation_id: 'r1',
      relation_code: 'FRA-STR',
      depot_label: 'Halle Frankfurt',
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

function mkStop(
  stop_type: 'PICKUP' | 'DELIVERY',
  zip: string,
  country_code: string,
) {
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
