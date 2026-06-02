/**
 * H3 Tests fuer setPackageItemPosition + resetTourPositions.
 * Mock-Prisma (kein DB-Touch) — wir asserten die Aufrufe an
 * shipment_package_item_positions (neu) UND
 * shipment_package_items (Legacy-Sync-Pflege).
 */
import { LoadingService } from './loading.service';

function mkPrisma() {
  return {
    shipment_package_items: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    shipment_package_item_positions: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    tours: {
      findUnique: jest.fn(),
    },
  };
}

describe('LoadingService H3 — setPackageItemPosition', () => {
  it('paletteIndex=0 (default) → upsert neue Tabelle + sync alte pos_*-Spalten', async () => {
    const prisma = mkPrisma();
    prisma.shipment_package_items.findUnique.mockResolvedValue({
      id: 'item-1',
      rotation_deg: 0,
    });
    prisma.shipment_package_item_positions.upsert.mockResolvedValue({});
    prisma.shipment_package_items.update.mockResolvedValue({ id: 'item-1' });
    const svc = new LoadingService(prisma as any, {} as any);

    await svc.setPackageItemPosition('item-1', {
      posXCm: 100,
      posYCm: 200,
      posZCm: 0,
      rotationDeg: 90,
    });

    // Upsert in neuer Tabelle mit paletteIndex=0
    const upsertCall = prisma.shipment_package_item_positions.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({
      item_id_palette_index: { item_id: 'item-1', palette_index: 0 },
    });
    expect(upsertCall.create).toMatchObject({
      item_id: 'item-1',
      palette_index: 0,
      pos_x_cm: 100,
      pos_y_cm: 200,
      pos_z_cm: 0,
      rotation_deg: 90,
    });
    expect(upsertCall.update).toMatchObject({
      pos_x_cm: 100,
      pos_y_cm: 200,
      pos_z_cm: 0,
      rotation_deg: 90,
    });

    // Sync: alte pos_*-Spalten gepflegt
    const updateCall = prisma.shipment_package_items.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'item-1' });
    expect(updateCall.data).toEqual({
      pos_x_cm: 100,
      pos_y_cm: 200,
      pos_z_cm: 0,
      rotation_deg: 90,
    });
  });

  it('paletteIndex=1 → NUR upsert neue Tabelle, ALTE pos_*-Spalten UNBERUEHRT', async () => {
    const prisma = mkPrisma();
    prisma.shipment_package_items.findUnique.mockResolvedValue({
      id: 'item-1',
      rotation_deg: 0,
    });
    prisma.shipment_package_item_positions.upsert.mockResolvedValue({});
    const svc = new LoadingService(prisma as any, {} as any);

    await svc.setPackageItemPosition('item-1', {
      posXCm: 50,
      posYCm: 60,
      posZCm: 0,
      paletteIndex: 1,
    });

    // Upsert ja, mit pIdx=1
    const upsertCall = prisma.shipment_package_item_positions.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({
      item_id_palette_index: { item_id: 'item-1', palette_index: 1 },
    });
    expect(upsertCall.create).toMatchObject({
      palette_index: 1,
      pos_x_cm: 50,
      pos_y_cm: 60,
    });

    // Alte Spalten NICHT angefasst
    expect(prisma.shipment_package_items.update).not.toHaveBeenCalled();
  });

  it('paletteIndex=0 + nur posXCm gesetzt → upsert UPDATE-Branch enthaelt nur pos_x_cm', async () => {
    const prisma = mkPrisma();
    prisma.shipment_package_items.findUnique.mockResolvedValue({
      id: 'item-1',
      rotation_deg: 0,
    });
    prisma.shipment_package_item_positions.upsert.mockResolvedValue({});
    prisma.shipment_package_items.update.mockResolvedValue({ id: 'item-1' });
    const svc = new LoadingService(prisma as any, {} as any);

    await svc.setPackageItemPosition('item-1', { posXCm: 42 });

    const upsertCall = prisma.shipment_package_item_positions.upsert.mock.calls[0][0];
    // CREATE: undefined-Werte werden zu null (DB-NULL fuer das neu
    // angelegte Row).
    expect(upsertCall.create).toMatchObject({
      pos_x_cm: 42,
      pos_y_cm: null,
      pos_z_cm: null,
      rotation_deg: 0,
    });
    // UPDATE: nur pos_x_cm + updated_at, keine y/z/rotation-Felder.
    expect(upsertCall.update).toHaveProperty('pos_x_cm', 42);
    expect(upsertCall.update).not.toHaveProperty('pos_y_cm');
    expect(upsertCall.update).not.toHaveProperty('pos_z_cm');
    expect(upsertCall.update).not.toHaveProperty('rotation_deg');

    // Sync alte Spalte: NUR pos_x_cm
    const updateData = prisma.shipment_package_items.update.mock.calls[0][0].data;
    expect(updateData).toEqual({ pos_x_cm: 42 });
  });

  it('NULL-Body (Reset) bei pIdx=0 → upsert mit null + Sync alte pos_*=null', async () => {
    const prisma = mkPrisma();
    prisma.shipment_package_items.findUnique.mockResolvedValue({
      id: 'item-1',
      rotation_deg: 0,
    });
    prisma.shipment_package_item_positions.upsert.mockResolvedValue({});
    prisma.shipment_package_items.update.mockResolvedValue({ id: 'item-1' });
    const svc = new LoadingService(prisma as any, {} as any);

    await svc.setPackageItemPosition('item-1', {
      posXCm: null,
      posYCm: null,
      posZCm: null,
    });

    const upsertCall = prisma.shipment_package_item_positions.upsert.mock.calls[0][0];
    expect(upsertCall.update).toEqual(
      expect.objectContaining({
        pos_x_cm: null,
        pos_y_cm: null,
        pos_z_cm: null,
      }),
    );
    const updateData = prisma.shipment_package_items.update.mock.calls[0][0].data;
    expect(updateData).toEqual({
      pos_x_cm: null,
      pos_y_cm: null,
      pos_z_cm: null,
    });
  });

  it('item nicht gefunden → NotFoundException, KEIN upsert', async () => {
    const prisma = mkPrisma();
    prisma.shipment_package_items.findUnique.mockResolvedValue(null);
    const svc = new LoadingService(prisma as any, {} as any);

    await expect(
      svc.setPackageItemPosition('nope', { posXCm: 1 }),
    ).rejects.toThrow(/nicht gefunden/);
    expect(
      prisma.shipment_package_item_positions.upsert,
    ).not.toHaveBeenCalled();
  });
});

describe('LoadingService H3 — resetTourPositions', () => {
  it('DELETE neue Tabelle + updateMany alte pos_*=null', async () => {
    const prisma = mkPrisma();
    prisma.tours.findUnique.mockResolvedValue({ id: 'tour-1' });
    prisma.shipment_package_items.findMany.mockResolvedValue([
      { id: 'it-1' },
      { id: 'it-2' },
      { id: 'it-3' },
    ]);
    prisma.shipment_package_item_positions.deleteMany.mockResolvedValue({
      count: 5,
    });
    prisma.shipment_package_items.updateMany.mockResolvedValue({ count: 3 });
    const svc = new LoadingService(prisma as any, {} as any);

    const out = await svc.resetTourPositions('tour-1');
    expect(out).toEqual({ success: true, updated: 3 });

    // DELETE-Where adressiert genau die item-IDs der Tour
    const delCall =
      prisma.shipment_package_item_positions.deleteMany.mock.calls[0][0];
    expect(delCall.where.item_id.in.sort()).toEqual(
      ['it-1', 'it-2', 'it-3'].sort(),
    );

    // updateMany setzt alle alten Spalten null
    const updMany = prisma.shipment_package_items.updateMany.mock.calls[0][0];
    expect(updMany.data).toEqual({
      pos_x_cm: null,
      pos_y_cm: null,
      pos_z_cm: null,
      rotation_deg: 0,
    });
  });

  it('Tour ohne Items → kein DELETE, updateMany trotzdem (= 0 rows)', async () => {
    const prisma = mkPrisma();
    prisma.tours.findUnique.mockResolvedValue({ id: 'tour-1' });
    prisma.shipment_package_items.findMany.mockResolvedValue([]);
    prisma.shipment_package_items.updateMany.mockResolvedValue({ count: 0 });
    const svc = new LoadingService(prisma as any, {} as any);

    const out = await svc.resetTourPositions('tour-1');
    expect(out).toEqual({ success: true, updated: 0 });
    expect(
      prisma.shipment_package_item_positions.deleteMany,
    ).not.toHaveBeenCalled();
  });

  it('Tour nicht gefunden → NotFoundException', async () => {
    const prisma = mkPrisma();
    prisma.tours.findUnique.mockResolvedValue(null);
    const svc = new LoadingService(prisma as any, {} as any);

    await expect(svc.resetTourPositions('nope')).rejects.toThrow(
      /nicht gefunden/,
    );
  });
});
