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
  clusterByCustomerId,
  clusterByRadius,
  clusterByZip,
  isFvPoolMode,
  isNvPoolMode,
  mapShipmentToPoolItem,
  NV_PREFIX_DIGITS_DEFAULT,
  POOL_CAP_DEFAULT,
  resolvePool,
  type ShipmentPoolItem,
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
    // C3: WHERE.OR enthaelt jetzt prefix-clauses (+ ggf. customer/
    // BBox); Fixture ohne customer_id/lat/lng → nur prefix-clauses.
    const prefixOrs = callArg.where.OR.filter(
      (c: any) =>
        c.addresses_shipments_loading_address_idToaddresses?.zip
          ?.startsWith,
    );
    expect(prefixOrs).toEqual([
      {
        addresses_shipments_loading_address_idToaddresses: {
          country_code: 'DE',
          zip: { startsWith: '704' },
        },
      },
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
    const prefixOrs = findManyMock.mock.calls[0][0].where.OR.filter(
      (c: any) =>
        c.addresses_shipments_loading_address_idToaddresses?.zip
          ?.startsWith,
    );
    expect(prefixOrs).toHaveLength(3);
    expect(
      prefixOrs.map(
        (c: any) =>
          c.addresses_shipments_loading_address_idToaddresses,
      ),
    ).toEqual(
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
    const prefixOrs = findManyMock.mock.calls[0][0].where.OR.filter(
      (c: any) =>
        c.addresses_shipments_loading_address_idToaddresses?.zip
          ?.startsWith,
    );
    expect(
      prefixOrs[0].addresses_shipments_loading_address_idToaddresses.zip
        .startsWith,
    ).toBe('70');
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
    const findManyMock = jest.fn().mockResolvedValue([
      // C3-fix: delivery-zip muss zum Anker-Prefix ('603') passen,
      // damit der neue Post-Filter (zip-prefix-Match auf anchor-Adresse)
      // das Item durchlaesst. Vorher unbeachtet, weil nur der SQL-
      // Mock zaehlte.
      makeShipmentRow({
        id: 's3',
        addresses_shipments_delivery_address_idToaddresses: {
          lat: 48.13,
          lng: 11.58,
          zip: '60311',
          city: 'Frankfurt',
          street: 'Marienpl. 1',
          country_code: 'DE',
        },
      }),
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
    // anchor=delivery: zip/city/lat/lng aus delivery-Adresse
    expect(out[0]).toMatchObject({
      zip: '60311',
      city: 'Frankfurt',
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
    // C3: prefix-clauses sitzen in WHERE.OR und targeten delivery-Adresse.
    const prefixOrs = callArg.where.OR.filter(
      (c: any) =>
        c.addresses_shipments_delivery_address_idToaddresses?.zip
          ?.startsWith,
    );
    expect(prefixOrs).toEqual([
      {
        addresses_shipments_delivery_address_idToaddresses: {
          country_code: 'DE',
          zip: { startsWith: '603' },
        },
      },
    ]);
    // KEINE loading-Adresse-OR-Klausel im NV-delivery-Pfad.
    const loadingOrs = callArg.where.OR.filter(
      (c: any) =>
        c.addresses_shipments_loading_address_idToaddresses != null,
    );
    expect(loadingOrs).toEqual([]);
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
    // C3: Depot-Match sitzt jetzt als OR-Klausel.
    const depotOr = callArg.where.OR.find(
      (c: any) => c.relation?.network_partner_id?.in,
    );
    expect(depotOr.relation.network_partner_id.in.sort()).toEqual(
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

// ─── C2 (Sprint Geo-Hof): Cluster-Helper-Tests ─────────────────

function mkItem(overrides: Partial<ShipmentPoolItem> = {}): ShipmentPoolItem {
  return {
    id: 'i-' + Math.random().toString(36).slice(2, 8),
    shipment_number: 'S-X',
    weight_kg: 100,
    ldm: 1,
    volume_m3: 1,
    length_cm: 100,
    width_cm: 80,
    height_cm: 100,
    effective_pallets: 1,
    customer_id: null,
    customer_name: null,
    lat: 0,
    lng: 0,
    zip: null,
    city: null,
    loading_street: null,
    loading_country: null,
    distance_km: 0,
    package_items: [],
    transport_type: null,
    delivery_zip: null,
    delivery_city: null,
    delivery_country: null,
    relation_id: null,
    relation_code: null,
    depot_label: null,
    ...overrides,
  };
}

describe('C2 clusterByCustomerId', () => {
  it('gruppiert nach customer_id', () => {
    const items = [
      mkItem({ id: 'a', customer_id: 'c1' }),
      mkItem({ id: 'b', customer_id: 'c2' }),
      mkItem({ id: 'c', customer_id: 'c1' }),
    ];
    const m = clusterByCustomerId(items);
    expect(m.size).toBe(2);
    expect(m.get('c1')?.map((x) => x.id)).toEqual(['a', 'c']);
    expect(m.get('c2')?.map((x) => x.id)).toEqual(['b']);
  });

  it('null customer_id landet unter __no_customer__ (kein Verlust)', () => {
    const items = [
      mkItem({ id: 'a', customer_id: null }),
      mkItem({ id: 'b', customer_id: 'c1' }),
      mkItem({ id: 'c', customer_id: null }),
    ];
    const m = clusterByCustomerId(items);
    expect(m.get('__no_customer__')?.map((x) => x.id)).toEqual(['a', 'c']);
    expect(m.get('c1')?.map((x) => x.id)).toEqual(['b']);
  });

  it('leere Eingabe → leere Map', () => {
    expect(clusterByCustomerId([]).size).toBe(0);
  });
});

describe('C2 clusterByZip', () => {
  it('gruppiert nach Zip-Prefix (digits)', () => {
    const items = [
      mkItem({ id: 'a', zip: '70435' }),
      mkItem({ id: 'b', zip: '70439' }),
      mkItem({ id: 'c', zip: '80331' }),
    ];
    const m = clusterByZip(items, 3);
    expect(m.size).toBe(2);
    expect(m.get('704')?.map((x) => x.id)).toEqual(['a', 'b']);
    expect(m.get('803')?.map((x) => x.id)).toEqual(['c']);
  });

  it('digits=5 → exakte Zip; jede unique Zip eigene Gruppe', () => {
    const items = [
      mkItem({ id: 'a', zip: '70435' }),
      mkItem({ id: 'b', zip: '70439' }),
    ];
    const m = clusterByZip(items, 5);
    expect(m.size).toBe(2);
  });

  it('null/leerer Zip landet unter __no_zip__', () => {
    const items = [
      mkItem({ id: 'a', zip: null }),
      mkItem({ id: 'b', zip: '' }),
      mkItem({ id: 'c', zip: '70435' }),
    ];
    const m = clusterByZip(items, 3);
    expect(m.get('__no_zip__')?.map((x) => x.id)).toEqual(['a', 'b']);
    expect(m.get('704')?.map((x) => x.id)).toEqual(['c']);
  });

  it('digits < 1 wird auf 1 normalisiert (plzPrefix-Min)', () => {
    const items = [mkItem({ id: 'a', zip: '70435' })];
    const m = clusterByZip(items, 0);
    expect(m.get('7')?.map((x) => x.id)).toEqual(['a']);
  });
});

describe('C2 clusterByRadius', () => {
  // Stuttgart-Hbf
  const stgtLat = 48.7758;
  const stgtLng = 9.1829;

  it('Items innerhalb Radius bleiben, ausserhalb fliegen raus', () => {
    const items = [
      // Esslingen (~10 km)
      mkItem({ id: 'esslingen', lat: 48.7406, lng: 9.31 }),
      // Karlsruhe (~64 km)
      mkItem({ id: 'karlsruhe', lat: 49.0069, lng: 8.4037 }),
      // Muenchen (~192 km)
      mkItem({ id: 'muenchen', lat: 48.1351, lng: 11.582 }),
    ];
    const r20 = clusterByRadius(items, stgtLat, stgtLng, 20);
    expect(r20.map((x) => x.id)).toEqual(['esslingen']);
    const r100 = clusterByRadius(items, stgtLat, stgtLng, 100);
    expect(r100.map((x) => x.id).sort()).toEqual([
      'esslingen',
      'karlsruhe',
    ]);
  });

  it('setzt distance_km auf den gefilterten Items', () => {
    const items = [mkItem({ id: 'esslingen', lat: 48.7406, lng: 9.31 })];
    const r = clusterByRadius(items, stgtLat, stgtLng, 20);
    expect(r).toHaveLength(1);
    expect(r[0].distance_km).toBeGreaterThan(0);
    expect(r[0].distance_km).toBeLessThan(20);
  });

  it('Items ohne lat/lng (0/0 Sentinel) sauber raus, KEIN NaN/false-Hit', () => {
    const items = [
      mkItem({ id: 'fehlend', lat: 0, lng: 0 }),
      mkItem({ id: 'fehlend-explizit', lat: NaN as unknown as number, lng: NaN as unknown as number }),
      mkItem({ id: 'gueltig', lat: 48.7406, lng: 9.31 }),
    ];
    const r = clusterByRadius(items, stgtLat, stgtLng, 5000);
    expect(r.map((x) => x.id)).toEqual(['gueltig']);
  });

  it('radius<=0 → leere Liste', () => {
    const items = [mkItem({ id: 'a', lat: 48.7406, lng: 9.31 })];
    expect(clusterByRadius(items, stgtLat, stgtLng, 0)).toEqual([]);
    expect(clusterByRadius(items, stgtLat, stgtLng, -5)).toEqual([]);
  });

  it('Anchor mit NaN/Infinity → leere Liste (kein Crash)', () => {
    const items = [mkItem({ id: 'a', lat: 48.7406, lng: 9.31 })];
    expect(clusterByRadius(items, NaN, 9, 50)).toEqual([]);
    expect(clusterByRadius(items, 48, Infinity, 50)).toEqual([]);
  });

  it('mutiert die Original-Items NICHT (immutable Output)', () => {
    const orig = mkItem({ id: 'a', lat: 48.7406, lng: 9.31, distance_km: 99 });
    const r = clusterByRadius([orig], stgtLat, stgtLng, 50);
    expect(orig.distance_km).toBe(99);
    expect(r[0].distance_km).not.toBe(99);
  });
});

describe('C2 customer_id im POOL_ITEM_SELECT/Mapper', () => {
  it('mapShipmentToPoolItem zieht customer_id direkt + fallback auf customers.id', () => {
    const row1 = {
      id: 's1',
      shipment_number: 'S-1',
      weight_kg: 100,
      ldm: 1,
      volume_m3: 1,
      length_cm: 100,
      width_cm: 80,
      height_cm: 100,
      effective_pallets: 1,
      customer_id: 'cust-direct',
      customers: { id: 'cust-via-rel', name: 'Test' },
      addresses_shipments_loading_address_idToaddresses: {
        zip: '70435', city: 'S', lat: 48.78, lng: 9.18,
        street: 'X', country_code: 'DE',
      },
      addresses_shipments_delivery_address_idToaddresses: {
        zip: '80331', city: 'M', lat: 48.13, lng: 11.58,
        street: 'Y', country_code: 'DE',
      },
      relation_id: null,
      relation: null,
      shipment_package_items: [],
      transport_type: null,
    };
    const m1 = mapShipmentToPoolItem(row1, { anchor: 'loading' });
    expect(m1.customer_id).toBe('cust-direct');

    // Fallback: customer_id null, aber customers.id da.
    const row2 = { ...row1, customer_id: null };
    const m2 = mapShipmentToPoolItem(row2, { anchor: 'loading' });
    expect(m2.customer_id).toBe('cust-via-rel');

    // Beides null → null.
    const row3 = { ...row1, customer_id: null, customers: { name: 'X' } };
    const m3 = mapShipmentToPoolItem(row3, { anchor: 'loading' });
    expect(m3.customer_id).toBeNull();
  });
});

// ─── C3 (Sprint Geo-Hof): resolvePool Geo-Match-Cascade ─────────

describe('C3 resolvePool NV — Geo-Match (customer/prefix/radius)', () => {
  function nvTour(stops: any[]) {
    return {
      nv_touren: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', stops }),
      },
    };
  }
  function pickupStop(
    zip: string,
    country = 'DE',
    lat: number | null = null,
    lng: number | null = null,
    customer_id: string | null = null,
  ) {
    return {
      stop_type: 'PICKUP',
      shipment: {
        customer_id,
        addresses_shipments_loading_address_idToaddresses: {
          zip,
          country_code: country,
          lat,
          lng,
        },
        addresses_shipments_delivery_address_idToaddresses: null,
      },
    };
  }

  it('customerId-Match: Tour-Anker hat customer_id, Pool-Sendung gleicher customer_id → passt (auch ohne PLZ-Match)', async () => {
    // Tour-Stop hat customer_id='c1', aber kein zip → KEIN prefix-Anker.
    // Pool-Sendung weitab (delivery=70435 vs Tour-keine-zip), aber
    // customer_id='c1' → matched.
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-cust',
        customer_id: 'c1',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 48.78, lng: 9.18, zip: '70435', city: 'S',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([
        // Stop ohne zip + ohne lat/lng + nur customer_id.
        {
          stop_type: 'PICKUP',
          shipment: {
            customer_id: 'c1',
            addresses_shipments_loading_address_idToaddresses: {
              zip: null,
              country_code: 'DE',
              lat: null,
              lng: null,
            },
            addresses_shipments_delivery_address_idToaddresses: null,
          },
        },
      ]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out.map((x) => x.id)).toEqual(['s-cust']);
    // WHERE.OR enthaelt customer_id-clause.
    const where = findMany.mock.calls[0][0].where;
    const custOr = where.OR.find((c: any) => c.customer_id?.in);
    expect(custOr.customer_id.in).toEqual(['c1']);
  });

  it('zip-Prefix bleibt NV-Pfad (prefix3 default)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-prefix',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 48.78, lng: 9.18, zip: '70499', city: 'S',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([pickupStop('70435')]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out.map((x) => x.id)).toEqual(['s-prefix']);
  });

  it('Radius-Match (NV 20 km default): Pool-Sendung weit weg → raus, in Radius → drin', async () => {
    // Tour-Anker: Stuttgart-Hbf (48.7758, 9.1829).
    // Pool: (a) Esslingen ~10 km → drin, (b) Karlsruhe ~64 km → raus.
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-esslingen',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 48.7406, lng: 9.31, zip: '73728', city: 'Esslingen',
          street: 'X', country_code: 'DE',
        },
      }),
      makeShipmentRow({
        id: 's-karlsruhe',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 49.0069, lng: 8.4037, zip: '76131', city: 'Karlsruhe',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      // Anker mit zip='9999' (kein Pool-Match darueber) + lat/lng.
      ...nvTour([pickupStop('9999', 'DE', 48.7758, 9.1829)]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out.map((x) => x.id)).toEqual(['s-esslingen']);
  });

  it('Default-Radius greift: NV=20 km, FV=100 km (Karlsruhe ~64 km)', async () => {
    // Setup wie zuvor; Karlsruhe sollte bei NV draussen, bei FV
    // theoretisch drin sein (Test FV-Pfad separat unten).
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-karlsruhe',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 49.0069, lng: 8.4037, zip: '76131', city: 'Karlsruhe',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([pickupStop('9999', 'DE', 48.7758, 9.1829)]),
      shipments: { findMany },
    };
    const outDefault = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(outDefault).toEqual([]); // 20 km Default schliesst aus.
    // Mit radiusKm=100 → drin.
    const out100 = await resolvePool(
      prisma as any,
      't1',
      'nv-pickup',
      { radiusKm: 100 },
    );
    expect(out100.map((x) => x.id)).toEqual(['s-karlsruhe']);
  });

  it('Radius-Pfad uebersprungen wenn Anker ohne lat/lng (kein NaN-Match)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-far',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 48.7758, lng: 9.1829, zip: '76131', city: 'X',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      // Anker hat zip='704' (greift Prefix) + KEIN lat/lng → kein
      // Radius-Pfad. Item-zip '76131' matcht prefix3='704' NICHT.
      // customer_id beide null. → kein Pfad triggert → leer.
      ...nvTour([pickupStop('70435', 'DE', null, null)]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out).toEqual([]);
  });

  it('OR-Kombi: customer_id OR prefix OR radius (1 trifft reicht)', async () => {
    // 3 Pool-Sendungen, eine pro Pfad:
    const findMany = jest.fn().mockResolvedValue([
      // (a) Customer-Match
      makeShipmentRow({
        id: 's-c',
        customer_id: 'c1',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 50, lng: 5, zip: '99999', city: 'far',
          street: 'X', country_code: 'DE',
        },
      }),
      // (b) Prefix-Match Fallback — C3b: nur ohne Geo greift prefix3.
      // Item ohne lat/lng → minDistToAnkers=null → Fallback-Pfad.
      makeShipmentRow({
        id: 's-p',
        customer_id: 'c-other',
        addresses_shipments_loading_address_idToaddresses: {
          lat: null, lng: null, zip: '70499', city: 'no-geo-prefix',
          street: 'X', country_code: 'DE',
        },
      }),
      // (c) Radius-Match (Esslingen)
      makeShipmentRow({
        id: 's-r',
        customer_id: 'c-other',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 48.7406, lng: 9.31, zip: '99999', city: 'Esslingen',
          street: 'X', country_code: 'DE',
        },
      }),
      // (d) NICHTS matcht → raus
      makeShipmentRow({
        id: 's-nope',
        customer_id: 'c-other',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 50, lng: 5, zip: '99999', city: 'nope',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([pickupStop('70435', 'DE', 48.7758, 9.1829, 'c1')]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out.map((x) => x.id).sort()).toEqual(['s-c', 's-p', 's-r']);
  });

  it('Keine Anker (kein prefix + kein customer + kein lat/lng) → leerer Pool, KEINE shipments-Query', async () => {
    const findMany = jest.fn();
    const prisma = {
      ...nvTour([
        {
          stop_type: 'PICKUP',
          shipment: {
            customer_id: null,
            addresses_shipments_loading_address_idToaddresses: {
              zip: null, country_code: 'DE', lat: null, lng: null,
            },
            addresses_shipments_delivery_address_idToaddresses: null,
          },
        },
      ]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('C3 resolvePool FV-Sammelgut — Geo-Match', () => {
  function fvTour(shipments: any[]) {
    return {
      tours: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          shipments,
        }),
      },
    };
  }
  function fvAnkerShipment(opts: {
    customer_id?: string | null;
    network_partner_id?: string | null;
    deliveryZip?: string | null;
    deliveryCountry?: string;
    deliveryLat?: number | null;
    deliveryLng?: number | null;
  }) {
    return {
      customer_id: opts.customer_id ?? null,
      relation: opts.network_partner_id
        ? { network_partner_id: opts.network_partner_id }
        : null,
      addresses_shipments_delivery_address_idToaddresses: {
        zip: opts.deliveryZip ?? null,
        country_code: opts.deliveryCountry ?? 'DE',
        lat: opts.deliveryLat ?? null,
        lng: opts.deliveryLng ?? null,
      },
    };
  }

  it('Depot-Match bleibt (FV-bestehende Regel) + zip-Prefix NEU als OR-Pfad', async () => {
    const findMany = jest.fn().mockResolvedValue([
      // Item via Depot
      makeShipmentRow({
        id: 's-depot',
        transport_type: 'SAMMELGUT',
        customer_id: 'c-other',
        relation_id: 'r1',
        relation: { code: 'X', network_partner_id: 'np-A' },
        addresses_shipments_delivery_address_idToaddresses: {
          lat: 50, lng: 5, zip: '99999', city: 'far-no-prefix',
          street: 'X', country_code: 'DE',
        },
      }),
      // Item via delivery-zip-Prefix
      makeShipmentRow({
        id: 's-zip',
        transport_type: 'SAMMELGUT',
        customer_id: 'c-other',
        relation_id: 'r-other',
        relation: { code: 'X', network_partner_id: 'np-not-anker' },
        addresses_shipments_delivery_address_idToaddresses: {
          lat: 50, lng: 5, zip: '60311', city: 'Frankfurt',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...fvTour([
        fvAnkerShipment({
          network_partner_id: 'np-A',
          deliveryZip: '60305',
          deliveryCountry: 'DE',
        }),
      ]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'fv-sammelgut');
    expect(out.map((x) => x.id).sort()).toEqual(['s-depot', 's-zip']);
    // WHERE.OR enthaelt sowohl Depot-Klausel als auch zip-Prefix.
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR.some((c: any) => c.relation?.network_partner_id?.in))
      .toBe(true);
    expect(
      where.OR.some(
        (c: any) =>
          c.addresses_shipments_delivery_address_idToaddresses?.zip
            ?.startsWith,
      ),
    ).toBe(true);
  });

  it('Radius-Pfad (FV Default 100 km, delivery-Adresse)', async () => {
    // Tour-Anker delivery=Stuttgart. Pool Karlsruhe (~64 km) → drin.
    // Muenchen (~192 km) → raus.
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-karlsruhe',
        transport_type: 'SAMMELGUT',
        customer_id: 'c-other',
        relation_id: 'r-other',
        relation: { code: 'X', network_partner_id: 'np-other' },
        addresses_shipments_delivery_address_idToaddresses: {
          lat: 49.0069, lng: 8.4037, zip: '76131', city: 'Karlsruhe',
          street: 'X', country_code: 'DE',
        },
      }),
      makeShipmentRow({
        id: 's-muenchen',
        transport_type: 'SAMMELGUT',
        customer_id: 'c-other',
        relation_id: 'r-other',
        relation: { code: 'X', network_partner_id: 'np-other' },
        addresses_shipments_delivery_address_idToaddresses: {
          lat: 48.1351, lng: 11.582, zip: '80331', city: 'Muenchen',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...fvTour([
        // Tour-Anker: Stuttgart-Hbf delivery, keine network_partner_id
        // damit depot-Pfad nicht greift, kein zip-Prefix-Match
        // (anker-zip='9999').
        fvAnkerShipment({
          network_partner_id: null,
          deliveryZip: '9999',
          deliveryLat: 48.7758,
          deliveryLng: 9.1829,
        }),
      ]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'fv-sammelgut');
    expect(out.map((x) => x.id)).toEqual(['s-karlsruhe']);
  });

  it('customer_id-Pfad FV', async () => {
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-cust',
        transport_type: 'SAMMELGUT',
        customer_id: 'c1',
        relation_id: 'r-other',
        relation: { code: 'X', network_partner_id: 'np-other' },
        addresses_shipments_delivery_address_idToaddresses: {
          lat: 50, lng: 5, zip: '99999', city: 'far',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...fvTour([
        fvAnkerShipment({
          customer_id: 'c1',
          network_partner_id: null,
          deliveryZip: null,
        }),
      ]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'fv-sammelgut');
    expect(out.map((x) => x.id)).toEqual(['s-cust']);
  });

  it('Keine Anker (kein Depot/customer/zip/lat-lng) → leerer Pool, KEINE shipments-Query', async () => {
    const findMany = jest.fn();
    const prisma = {
      ...fvTour([fvAnkerShipment({})]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'fv-sammelgut');
    expect(out).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('C3 Defaults: Radius-Konstanten exportiert', () => {
  it('NV_RADIUS_KM_DEFAULT = 20, FV_RADIUS_KM_DEFAULT = 100', async () => {
    const {
      NV_RADIUS_KM_DEFAULT,
      FV_RADIUS_KM_DEFAULT,
    } = await import('./poolShipments.lib');
    expect(NV_RADIUS_KM_DEFAULT).toBe(20);
    expect(FV_RADIUS_KM_DEFAULT).toBe(100);
  });
});

// ─── C3b (NV-Nachbesserung): echter 20-km-Radius + distance_km ──

describe('C3b NV resolvePool — echter Haversine-Radius + distance_km', () => {
  function nvTour(stops: any[]) {
    return {
      nv_touren: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', stops }),
      },
    };
  }
  function pickupStop(
    zip: string | null,
    country = 'DE',
    lat: number | null = null,
    lng: number | null = null,
    customer_id: string | null = null,
  ) {
    return {
      stop_type: 'PICKUP',
      shipment: {
        customer_id,
        addresses_shipments_loading_address_idToaddresses: {
          zip,
          country_code: country,
          lat,
          lng,
        },
        addresses_shipments_delivery_address_idToaddresses: null,
      },
    };
  }
  // Stuttgart-Hbf
  const stgt = { lat: 48.7758, lng: 9.1829 };

  it('≤20km drin + distance_km = echte Haversine-Distanz', async () => {
    // Esslingen ~10 km von Stuttgart-Hbf.
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-esslingen',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 48.7406, lng: 9.31, zip: '73728', city: 'Esslingen',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      // Anker ohne PLZ-Treffer, NUR via Geo erreichbar.
      ...nvTour([pickupStop('9999', 'DE', stgt.lat, stgt.lng)]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('s-esslingen');
    expect(out[0].distance_km).toBeGreaterThan(0);
    expect(out[0].distance_km).toBeLessThan(20);
  });

  it('>20km raus AUCH wenn zip-Prefix matchen wuerde (Geo dominiert)', async () => {
    // Item-Geo weit weg, aber zip='70499' matcht Anker-prefix '704'.
    // C3b: weil Geo (item+anker) vorhanden ist, gilt strict Haversine
    // → prefix-Match wird ignoriert → DROP.
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-far-but-prefix',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 51.1657, lng: 10.4515, zip: '70499', city: 'far',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([pickupStop('70435', 'DE', stgt.lat, stgt.lng)]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out).toEqual([]);
  });

  it('prefix3-Fallback NUR wenn Item KEINE Geo (anker hat Geo)', async () => {
    // Item ohne lat/lng + zip='70499' → fallback prefix-Match (700 km
    // entfernt wäre OK, Geo ist nicht verfuegbar).
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-no-geo-prefix',
        addresses_shipments_loading_address_idToaddresses: {
          lat: null, lng: null, zip: '70499', city: 'no-geo',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([pickupStop('70435', 'DE', stgt.lat, stgt.lng)]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out.map((x) => x.id)).toEqual(['s-no-geo-prefix']);
    // Fallback ohne Geo → distance_km=0.
    expect(out[0].distance_km).toBe(0);
  });

  it('prefix3-Fallback NUR wenn Anker KEINE Geo (Item hat Geo)', async () => {
    // Anker ohne lat/lng → ankerCoords leer → fallback prefix-Match
    // greift. Item lat/lng vorhanden (irrelevant in Fallback-Pfad).
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-item-geo-fallback',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 51.5, lng: 7.0, zip: '70499', city: 'irgendwo',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([pickupStop('70435', 'DE', null, null)]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out.map((x) => x.id)).toEqual(['s-item-geo-fallback']);
    expect(out[0].distance_km).toBe(0);
  });

  it('Geo vorhanden + ausserhalb Radius + prefix NICHT match → DROP', async () => {
    // Item far + zip nicht im Anker-prefix. C3b: alles dropt.
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-nope',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 51.5, lng: 7.0, zip: '99999', city: 'far',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([pickupStop('70435', 'DE', stgt.lat, stgt.lng)]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out).toEqual([]);
  });

  it('customerId-Pfad unabhaengig von Radius (+ distance_km echt, wenn coords)', async () => {
    // Item: customer matched + Karlsruhe (~64 km, ausserhalb 20 km).
    // C3b: customer-Pfad bleibt; distance_km wird trotzdem real gesetzt.
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-cust',
        customer_id: 'c1',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 49.0069, lng: 8.4037, zip: '76131', city: 'Karlsruhe',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([
        pickupStop('70435', 'DE', stgt.lat, stgt.lng, 'c1'),
      ]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out.map((x) => x.id)).toEqual(['s-cust']);
    expect(out[0].distance_km).toBeGreaterThan(60);
    expect(out[0].distance_km).toBeLessThan(70);
  });

  it('customerId-Pfad ohne Item-Geo → distance_km=0 (kein NaN)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-cust-no-geo',
        customer_id: 'c1',
        addresses_shipments_loading_address_idToaddresses: {
          lat: null, lng: null, zip: '99999', city: 'no-geo',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([
        pickupStop('70435', 'DE', stgt.lat, stgt.lng, 'c1'),
      ]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out.map((x) => x.id)).toEqual(['s-cust-no-geo']);
    expect(out[0].distance_km).toBe(0);
  });

  it('distance_km ist min-Distanz zum NAECHSTEN Anker (mehrere Anker)', async () => {
    // 2 Anker: Stuttgart, Karlsruhe. Item: Esslingen (~10 km von
    // Stuttgart, ~70 km von Karlsruhe) → distance = ~10.
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-esslingen',
        addresses_shipments_loading_address_idToaddresses: {
          lat: 48.7406, lng: 9.31, zip: '73728', city: 'Esslingen',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      ...nvTour([
        pickupStop('9999', 'DE', 48.7758, 9.1829), // Stuttgart
        pickupStop('9999', 'DE', 49.0069, 8.4037), // Karlsruhe
      ]),
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-pickup');
    expect(out).toHaveLength(1);
    // ~10 km zu Stuttgart, NICHT ~70 zu Karlsruhe.
    expect(out[0].distance_km).toBeLessThan(15);
  });

  it('NV-delivery analog (delivery-Adresse als Anker, Radius greift)', async () => {
    // delivery anker Stuttgart, Item delivery Esslingen ~10 km.
    const findMany = jest.fn().mockResolvedValue([
      makeShipmentRow({
        id: 's-d',
        addresses_shipments_delivery_address_idToaddresses: {
          lat: 48.7406, lng: 9.31, zip: '73728', city: 'Esslingen',
          street: 'X', country_code: 'DE',
        },
      }),
    ]);
    const prisma = {
      nv_touren: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          stops: [
            {
              stop_type: 'DELIVERY',
              shipment: {
                customer_id: null,
                addresses_shipments_loading_address_idToaddresses: null,
                addresses_shipments_delivery_address_idToaddresses: {
                  zip: '9999',
                  country_code: 'DE',
                  lat: stgt.lat,
                  lng: stgt.lng,
                },
              },
            },
          ],
        }),
      },
      shipments: { findMany },
    };
    const out = await resolvePool(prisma as any, 't1', 'nv-delivery');
    expect(out.map((x) => x.id)).toEqual(['s-d']);
    expect(out[0].distance_km).toBeGreaterThan(0);
    expect(out[0].distance_km).toBeLessThan(20);
  });
});
