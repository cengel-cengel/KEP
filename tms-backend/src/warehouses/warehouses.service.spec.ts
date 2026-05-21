/**
 * R3-B: WarehousesService — getUmschlagWarehouse + ensureUmschlagAddressId.
 *
 * Mock-Prisma direkt im Konstruktor. Tests:
 *  - getUmschlagWarehouse: findFirst-WHERE-Form
 *  - ensureUmschlagAddressId: null wenn keine WH, null wenn unvoll-
 *    ständige Adresse, existing address id wenn bereits angelegt,
 *    create wenn neu.
 */
import { WarehousesService } from './warehouses.service';

function makeSvc(prisma: any): WarehousesService {
  return new WarehousesService(prisma);
}

describe('WarehousesService.getUmschlagWarehouse', () => {
  it('findFirst mit is_umschlag=true + active=true', async () => {
    const prisma: any = {
      warehouses: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wh-1', name: 'Umschlag-HH' }),
      },
    };
    const svc = makeSvc(prisma);
    const wh = await svc.getUmschlagWarehouse();
    expect(wh?.id).toBe('wh-1');
    const args = (prisma.warehouses.findFirst as jest.Mock).mock.calls[0][0];
    expect(args.where.is_umschlag).toBe(true);
    expect(args.where.active).toBe(true);
    expect(args.orderBy.name).toBe('asc');
  });

  it('liefert null wenn kein Umschlag-WH', async () => {
    const prisma: any = {
      warehouses: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = makeSvc(prisma);
    expect(await svc.getUmschlagWarehouse()).toBeNull();
  });
});

describe('WarehousesService.ensureUmschlagAddressId', () => {
  it('null wenn kein Umschlag-WH', async () => {
    const prisma: any = {
      warehouses: { findFirst: jest.fn().mockResolvedValue(null) },
      addresses: { findFirst: jest.fn(), create: jest.fn() },
    };
    const svc = makeSvc(prisma);
    const id = await svc.ensureUmschlagAddressId();
    expect(id).toBeNull();
    expect(prisma.addresses.findFirst).not.toHaveBeenCalled();
    expect(prisma.addresses.create).not.toHaveBeenCalled();
  });

  it('null wenn Umschlag-WH unvollständige Adresse (kein zip)', async () => {
    const prisma: any = {
      warehouses: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wh-1',
          name: 'WH',
          street: 'Hauptstr 1',
          zip: null,
          city: 'HH',
          country: 'DE',
        }),
      },
      addresses: { findFirst: jest.fn(), create: jest.fn() },
    };
    const svc = makeSvc(prisma);
    expect(await svc.ensureUmschlagAddressId()).toBeNull();
    expect(prisma.addresses.create).not.toHaveBeenCalled();
  });

  it('existing addresses-id zurückgeben (idempotent, kein create)', async () => {
    const prisma: any = {
      warehouses: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wh-1',
          name: 'Umschlag',
          street: 'A 1',
          zip: '20457',
          city: 'HH',
          country: 'DE',
          lat: 53.55,
          lng: 9.99,
        }),
      },
      addresses: {
        findFirst: jest.fn().mockResolvedValue({ id: 'addr-existing' }),
        create: jest.fn(),
      },
    };
    const svc = makeSvc(prisma);
    const id = await svc.ensureUmschlagAddressId();
    expect(id).toBe('addr-existing');
    expect(prisma.addresses.create).not.toHaveBeenCalled();
    // findFirst-WHERE-Form: type=depot + street+zip+city
    const args = (prisma.addresses.findFirst as jest.Mock).mock.calls[0][0];
    expect(args.where.type).toBe('depot');
    expect(args.where.street).toBe('A 1');
    expect(args.where.zip).toBe('20457');
    expect(args.where.city).toBe('HH');
  });

  it('neue addresses anlegen wenn nicht vorhanden', async () => {
    const prisma: any = {
      warehouses: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wh-1',
          name: 'Umschlag',
          street: 'A 1',
          zip: '20457',
          city: 'HH',
          country: 'DE',
          lat: 53.55,
          lng: 9.99,
        }),
      },
      addresses: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'addr-new' }),
      },
    };
    const svc = makeSvc(prisma);
    const id = await svc.ensureUmschlagAddressId();
    expect(id).toBe('addr-new');
    const createArgs = (prisma.addresses.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.type).toBe('depot');
    expect(createArgs.data.name).toBe('Umschlag');
    expect(createArgs.data.country_code).toBe('DE');
    expect(createArgs.data.lat).toBe(53.55);
  });
});
