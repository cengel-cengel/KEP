import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatusService } from '../status/status.service';

@Injectable()
export class HallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: StatusService,
  ) {}

  async getLocations() {
    // Include active stock per location (possibly multiple due to capacity)
    const locations = await this.prisma.hall_locations.findMany({
      where: { is_active: true },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
      include: {
        hall_stock: {
          where: { removed_at: null },
          include: {
            shipments: {
              select: {
                id: true,
                shipment_number: true,
                status: true,
                is_hazmat: true,
                customers: { select: { name: true } },
                addresses_shipments_loading_address_idToaddresses: {
                  select: { city: true, zip: true, country_code: true },
                },
                addresses_shipments_delivery_address_idToaddresses: {
                  select: { city: true, zip: true, country_code: true },
                },
              },
            },
          },
        },
      },
    });

    return locations.map((l) => ({
      id: l.id,
      code: l.code,
      type: l.type,
      zone: l.zone,
      capacity: l.capacity,
      description: l.description,
      is_active: l.is_active,
      stock: l.hall_stock.map((s) => ({
        id: s.id,
        shipmentId: s.shipment_id,
        placed_at: s.placed_at,
        shipment_number: s.shipments?.shipment_number,
        status: s.shipments?.status,
        customer_name: s.shipments?.customers?.name ?? null,
        from_city:
          s.shipments?.addresses_shipments_loading_address_idToaddresses
            ?.city ?? null,
        from_zip:
          s.shipments?.addresses_shipments_loading_address_idToaddresses?.zip ??
          null,
        to_city:
          s.shipments?.addresses_shipments_delivery_address_idToaddresses
            ?.city ?? null,
        to_zip:
          s.shipments?.addresses_shipments_delivery_address_idToaddresses
            ?.zip ?? null,
        is_hazmat: s.shipments?.is_hazmat ?? null,
      })),
    }));
  }

  async getStock() {
    const stock = await this.prisma.hall_stock.findMany({
      where: { removed_at: null },
      include: {
        hall_location: { select: { code: true, type: true, zone: true } },
        shipments: {
          include: {
            customers: { select: { name: true } },
            addresses_shipments_loading_address_idToaddresses: {
              select: { city: true, zip: true, country_code: true },
            },
            addresses_shipments_delivery_address_idToaddresses: {
              select: { city: true, zip: true, country_code: true },
            },
          },
        },
      },
      orderBy: [{ placed_at: 'desc' }],
    });

    return stock.map((s) => ({
      id: s.id,
      shipmentId: s.shipment_id,
      shipment_number: s.shipments.shipment_number,
      status: s.shipments.status,
      location_code: s.hall_location.code,
      location_type: s.hall_location.type,
      location_zone: s.hall_location.zone,
      placed_at: s.placed_at,
      customer_name: s.shipments.customers?.name ?? null,
      from_city:
        s.shipments.addresses_shipments_loading_address_idToaddresses?.city ??
        null,
      from_zip:
        s.shipments.addresses_shipments_loading_address_idToaddresses?.zip ??
        null,
      to_city:
        s.shipments.addresses_shipments_delivery_address_idToaddresses?.city ??
        null,
      to_zip:
        s.shipments.addresses_shipments_delivery_address_idToaddresses?.zip ??
        null,
      is_hazmat: s.shipments.is_hazmat,
    }));
  }

  async getStockForTour(tourId: string) {
    const expectedShipments = await this.prisma.shipments.findMany({
      where: { tour_id: tourId, deleted_at: null },
      select: {
        id: true,
        shipment_number: true,
        status: true,
        tour_id: true,
        ldm: true,
        package_count: true,
        weight_kg: true,
        customer_note: true,
        customers: { select: { name: true } },
        addresses_shipments_loading_address_idToaddresses: {
          select: { city: true, country_code: true },
        },
        addresses_shipments_delivery_address_idToaddresses: {
          select: { city: true, country_code: true },
        },
      },
    });

    if (expectedShipments.length === 0) {
      return { onStock: [], missing: [], unexpectedOnStock: [] };
    }

    const expectedShipmentIds = expectedShipments.map((s) => s.id);

    const expectedOnStockEntries = await this.prisma.hall_stock.findMany({
      where: { shipment_id: { in: expectedShipmentIds }, removed_at: null },
      include: {
        hall_location: { select: { code: true } },
        shipments: {
          select: {
            id: true,
            shipment_number: true,
            tour_id: true,
            status: true,
            ldm: true,
            package_count: true,
            weight_kg: true,
            customer_note: true,
            customers: { select: { name: true } },
            addresses_shipments_loading_address_idToaddresses: {
              select: { city: true },
            },
            addresses_shipments_delivery_address_idToaddresses: {
              select: { city: true, country_code: true },
            },
          },
        },
      },
    });

    const expectedLocationIds = [
      ...new Set(expectedOnStockEntries.map((e) => e.hall_location_id)),
    ];

    const locationStockEntries =
      expectedLocationIds.length > 0
        ? await this.prisma.hall_stock.findMany({
            where: {
              hall_location_id: { in: expectedLocationIds },
              removed_at: null,
            },
            include: {
              hall_location: { select: { code: true } },
              shipments: {
                select: {
                  id: true,
                  shipment_number: true,
                  tour_id: true,
                  status: true,
                  ldm: true,
                  package_count: true,
                  weight_kg: true,
                  customer_note: true,
                  customers: { select: { name: true } },
                  addresses_shipments_loading_address_idToaddresses: {
                    select: { city: true },
                  },
                  addresses_shipments_delivery_address_idToaddresses: {
                    select: { city: true, country_code: true },
                  },
                },
              },
            },
          })
        : [];

    const toStockDto = (entry: any) => {
      const loadCity =
        entry.shipments.addresses_shipments_loading_address_idToaddresses
          ?.city ?? '–';
      const unloadCity =
        entry.shipments.addresses_shipments_delivery_address_idToaddresses
          ?.city ?? '–';
      const unloadCountry =
        entry.shipments.addresses_shipments_delivery_address_idToaddresses
          ?.country_code ?? 'DE';

      return {
        shipmentId: entry.shipments.id,
        shipment_number: entry.shipments.shipment_number,
        customer_name: entry.shipments.customers?.name ?? null,
        location_code: entry.hall_location.code,
        status: entry.shipments.status,
        ldm: entry.shipments.ldm != null ? String(entry.shipments.ldm) : '0',
        package_count: entry.shipments.package_count ?? 0,
        weight_kg:
          entry.shipments.weight_kg != null
            ? String(entry.shipments.weight_kg)
            : '0',
        from_city: loadCity,
        to_city: unloadCity,
        to_country: unloadCountry,
        note: entry.shipments.customer_note ?? '',
      };
    };

    const expectedOnStockShipmentIds = new Set(
      expectedOnStockEntries.map((e) => e.shipments.id),
    );

    const onStock = locationStockEntries
      .filter((e) => e.shipments.tour_id === tourId)
      .map((e) => toStockDto(e));

    const unexpectedOnStock = locationStockEntries
      .filter((e) => e.shipments.tour_id !== tourId)
      .map((e) => toStockDto(e));

    const missing = expectedShipments
      .filter((s) => !expectedOnStockShipmentIds.has(s.id))
      .map((s) => {
        const loadCity =
          s.addresses_shipments_loading_address_idToaddresses?.city ?? '–';
        const unloadCity =
          s.addresses_shipments_delivery_address_idToaddresses?.city ?? '–';
        const unloadCountry =
          s.addresses_shipments_delivery_address_idToaddresses?.country_code ??
          'DE';
        return {
          shipmentId: s.id,
          shipment_number: s.shipment_number,
          customer_name: s.customers?.name ?? null,
          location_code: null,
          status: s.status,
          ldm: s.ldm != null ? String(s.ldm) : '0',
          package_count: s.package_count ?? 0,
          weight_kg: s.weight_kg != null ? String(s.weight_kg) : '0',
          from_city: loadCity,
          to_city: unloadCity,
          to_country: unloadCountry,
          note: s.customer_note ?? '',
        };
      });

    return { onStock, missing, unexpectedOnStock };
  }

  async placeShipment(
    shipmentId: string,
    locationCode: string,
    userId: string,
  ) {
    const location = await this.prisma.hall_locations.findUnique({
      where: { code: locationCode },
      select: { id: true, code: true, capacity: true },
    });
    if (!location)
      throw new NotFoundException(`Stellplatz ${locationCode} nicht gefunden`);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.hall_stock.findFirst({
        where: { shipment_id: shipmentId, removed_at: null },
      });
      if (existing)
        throw new BadRequestException('Sendung ist bereits eingelagert');

      const currentCount = await tx.hall_stock.count({
        where: { hall_location_id: location.id, removed_at: null },
      });
      if (currentCount >= (location.capacity ?? 1)) {
        throw new BadRequestException('Stellplatz ist voll');
      }

      const stock = await tx.hall_stock.create({
        data: {
          hall_location_id: location.id,
          shipment_id: shipmentId,
          placed_by: userId,
        },
        include: {
          shipments: {
            select: { id: true, shipment_number: true, status: true },
          },
        },
      });

      await tx.hall_movements.create({
        data: {
          shipment_id: shipmentId,
          from_location_id: null,
          to_location_id: location.id,
          action: 'EINLAGERUNG',
          performed_by: userId,
        },
      });

      return { stock, locationCode: location.code };
    });

    await this.status.addEvent(shipmentId, 'EINGELAGERT', {
      userId,
      location: result.locationCode,
      isAutomatic: true,
    });

    return result.stock;
  }

  async removeShipment(shipmentId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.hall_stock.findFirst({
        where: { shipment_id: shipmentId, removed_at: null },
        include: { hall_location: true },
      });
      if (!active) throw new NotFoundException('Sendung ist nicht eingelagert');

      const updated = await tx.hall_stock.update({
        where: { id: active.id },
        data: { removed_at: new Date(), removed_by: userId },
      });

      await tx.hall_movements.create({
        data: {
          shipment_id: shipmentId,
          from_location_id: active.hall_location_id,
          to_location_id: null,
          action: 'AUSLAGERUNG',
          performed_by: userId,
        },
      });

      return updated;
    });
  }

  async moveShipment(
    shipmentId: string,
    toLocationCode: string,
    userId: string,
  ) {
    const toLocation = await this.prisma.hall_locations.findUnique({
      where: { code: toLocationCode },
      select: { id: true, capacity: true, code: true },
    });
    if (!toLocation)
      throw new NotFoundException(
        `Stellplatz ${toLocationCode} nicht gefunden`,
      );

    return this.prisma.$transaction(async (tx) => {
      const active = await tx.hall_stock.findFirst({
        where: { shipment_id: shipmentId, removed_at: null },
      });
      if (!active) throw new NotFoundException('Sendung ist nicht eingelagert');

      const currentCount = await tx.hall_stock.count({
        where: { hall_location_id: toLocation.id, removed_at: null },
      });
      if (currentCount >= (toLocation.capacity ?? 1)) {
        throw new BadRequestException('Ziel-Stellplatz ist voll');
      }

      await tx.hall_stock.update({
        where: { id: active.id },
        data: { removed_at: new Date(), removed_by: userId },
      });

      const newStock = await tx.hall_stock.create({
        data: {
          hall_location_id: toLocation.id,
          shipment_id: shipmentId,
          placed_by: userId,
        },
      });

      await tx.hall_movements.create({
        data: {
          shipment_id: shipmentId,
          from_location_id: active.hall_location_id,
          to_location_id: toLocation.id,
          action: 'UMLAGERUNG',
          performed_by: userId,
        },
      });

      return newStock;
    });
  }

  async getMovements(date?: Date) {
    const where: any = {};
    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setDate(d.getDate() + 1);
      where.performed_at = { gte: d, lt: end };
    }

    const movements = await this.prisma.hall_movements.findMany({
      where,
      include: {
        shipments: { select: { shipment_number: true } },
        from_location: { select: { code: true } },
        to_location: { select: { code: true } },
        performed_by_user: { select: { name: true } },
      },
      orderBy: { performed_at: 'desc' },
      take: 200,
    });

    return movements.map((m) => ({
      id: m.id,
      shipmentId: m.shipment_id,
      shipment_number: m.shipments.shipment_number,
      action: m.action,
      from_location_code: m.from_location?.code ?? null,
      to_location_code: m.to_location?.code ?? null,
      performed_at: m.performed_at,
      performed_by_name: m.performed_by_user?.name ?? null,
      notes: m.notes ?? null,
    }));
  }

  async getAlerts() {
    const now = new Date();
    const agingThreshold = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const stocks = await this.prisma.hall_stock.findMany({
      where: { removed_at: null },
      include: {
        hall_location: { select: { code: true, type: true } },
        shipments: {
          include: {
            tours: { select: { id: true, tour_number: true, status: true } },
          },
        },
      },
    });

    const alerts: Array<{
      severity: 'red' | 'orange' | 'yellow';
      message: string;
      shipmentId?: string;
    }> = [];

    // Aging (>2 days on same place)
    for (const s of stocks) {
      if (s.placed_at && s.placed_at <= agingThreshold) {
        alerts.push({
          severity: 'yellow',
          message: `Gelbe Warnung: Sendung ${s.shipments.shipment_number} steht seit über 2 Tagen auf ${s.hall_location.code}`,
          shipmentId: s.shipment_id,
        });
      }
    }

    // ADR on wrong place
    for (const s of stocks) {
      if (s.shipments.is_hazmat) {
        const locType = s.hall_location.type;
        if (locType !== 'ADR' && locType !== 'KLAERPLATZ') {
          alerts.push({
            severity: 'red',
            message: `Rote Warnung: ADR-Sendung ${s.shipments.shipment_number} liegt auf falschem Platz (${locType})`,
            shipmentId: s.shipment_id,
          });
        }
      }
    }

    // Should have been dispatched (Tour planned but shipment still new)
    for (const s of stocks) {
      const tour = s.shipments.tours;
      if (
        tour &&
        ['dispatched', 'completed'].includes(tour.status) &&
        s.shipments.status === 'new'
      ) {
        alerts.push({
          severity: 'orange',
          message: `Orange Warnung: Sendung ${s.shipments.shipment_number} sollte bereits disponiert sein (Tour ${tour.tour_number})`,
          shipmentId: s.shipment_id,
        });
      }
    }

    return alerts;
  }

  async getDailyReport() {
    // Placeholder für den automatischen Soll-Ist-Abgleich (Sprint 8: Implementierung minimal)
    const stockCount = await this.prisma.hall_stock.count({
      where: { removed_at: null },
    });
    return { generatedAt: new Date(), stockCount };
  }

  async getCurrentCheck() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const check = await this.prisma.hall_checks.findFirst({
      where: { check_date: today },
      orderBy: { started_at: 'desc' },
      include: {
        items: {
          include: {
            shipments: {
              select: { shipment_number: true, status: true, is_hazmat: true },
            },
            hall_location: { select: { code: true, type: true } },
          },
          orderBy: { shipment_id: 'asc' },
        },
      },
    });

    if (!check) return null;

    return {
      id: check.id,
      check_date: check.check_date,
      status: check.status,
      started_at: check.started_at,
      completed_at: check.completed_at,
      discrepancies: check.discrepancies,
      items: check.items.map((it) => ({
        id: it.id,
        shipmentId: it.shipment_id,
        shipment_number: it.shipments.shipment_number,
        expected_status: it.expected_status,
        actual_status: it.actual_status,
        is_ok: it.is_ok,
        hall_location_code: it.hall_location?.code ?? null,
        hall_location_type: it.hall_location?.type ?? null,
        notes: it.notes ?? null,
      })),
    };
  }

  async startHallCheck(userId: string) {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    return this.prisma.$transaction(async (tx) => {
      const check = await tx.hall_checks.create({
        data: {
          check_date: today,
          performed_by: userId,
          started_at: now,
          status: 'open',
        },
      });

      const stocks = await tx.hall_stock.findMany({
        where: { removed_at: null },
        include: {
          shipments: {
            select: { id: true, shipment_number: true, is_hazmat: true },
          },
          hall_location: { select: { id: true, type: true, code: true } },
        },
      });

      const items = stocks.map((s) => {
        const expected = s.shipments.is_hazmat ? 'ADR' : 'NORMAL';
        const actual = s.hall_location.type;
        return {
          hall_check_id: check.id,
          shipment_id: s.shipments.id,
          hall_location_id: s.hall_location.id,
          expected_status: expected,
          actual_status: actual,
          is_ok: expected === actual,
        };
      });

      const createdItems = await tx.hall_check_items.createMany({
        data: items,
      });

      // Compute discrepancies
      const discrepancies = items.filter((i) => !i.is_ok).length;
      await tx.hall_checks.update({
        where: { id: check.id },
        data: { discrepancies },
      });

      // Return simplified response
      return {
        id: check.id,
        check_date: check.check_date,
        status: check.status,
        started_at: check.started_at,
        completed_at: check.completed_at,
        discrepancies,
        items,
        created: createdItems.count,
      };
    });
  }

  async completeHallCheck(checkId: string, items: any[], userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const check = await tx.hall_checks.findUnique({ where: { id: checkId } });
      if (!check) throw new NotFoundException('Hall-check nicht gefunden');

      const now = new Date();

      for (const it of items) {
        const actualStatus = it.actualStatus ?? undefined;
        const isOk = it.isOk ?? undefined;
        const notes = it.notes ?? null;

        // Update by shipment_id in this check
        await tx.hall_check_items.updateMany({
          where: { hall_check_id: checkId, shipment_id: it.shipmentId },
          data: {
            ...(actualStatus !== undefined && { actual_status: actualStatus }),
            ...(isOk !== undefined && { is_ok: isOk }),
            ...(notes !== null && { notes }),
          },
        });
      }

      await tx.hall_checks.update({
        where: { id: checkId },
        data: {
          status: 'completed',
          completed_at: now,
          performed_by: check.performed_by,
        },
      });

      // best-effort discrepancy recount
      const updatedItems = await tx.hall_check_items.findMany({
        where: { hall_check_id: checkId },
        select: { is_ok: true },
      });
      const discrepancies = updatedItems.filter(
        (x) => x.is_ok === false,
      ).length;
      await tx.hall_checks.update({
        where: { id: checkId },
        data: { discrepancies },
      });

      return this.getCurrentCheck();
    });
  }
}
