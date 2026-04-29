import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  LoadingLayout,
  LoadingOptimizerService,
  ShipmentLoad,
  Vehicle,
} from './loading-optimizer.service';
import * as fs from 'node:fs';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';

@Injectable()
export class LoadingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly optimizer: LoadingOptimizerService,
  ) {}

  private toShipmentLoad(s: any): ShipmentLoad {
    return {
      id: s.id,
      shipmentNumber: s.shipment_number,
      customer:
        s.customers?.name ??
        s.business_partner?.name ??
        s.business_partner?.partner_number ??
        '–',
      deliveryCity:
        s.addresses_shipments_delivery_address_idToaddresses?.city ?? '–',
      deliveryOrder: Number(s.tour_position) || 999,
      lengthCm: Number(s.length_cm) || 120,
      widthCm: Number(s.width_cm) || 80,
      heightCm: Number(s.height_cm) || 100,
      weightKg: Number(s.weight_kg) || 0,
      ldm: Number(s.ldm) || 0,
      isStackable: !String(s.package_type ?? '')
        .toLowerCase()
        .includes('drum'),
      packageCount: Number(s.package_count) || 0,
      packageType: String(s.package_type ?? 'other'),
    };
  }

  private async getTourShipments(tourId: string) {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        shipments: {
          where: { deleted_at: null },
          orderBy: { tour_position: 'asc' },
          include: {
            customers: { select: { name: true } },
            business_partner: { select: { name: true, partner_number: true } },
            addresses_shipments_delivery_address_idToaddresses: {
              select: { city: true, name: true, zip: true },
            },
          },
        },
      },
    });
    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);
    return tour;
  }

  async optimizeTour(tourId: string) {
    const tour = await this.getTourShipments(tourId);
    const shipmentLoads = tour.shipments.map((s) => this.toShipmentLoad(s));
    const recommendedVehicle = this.optimizer.recommendVehicle(shipmentLoads);
    const loadingOrder = this.optimizer.optimizeLoadingOrder(shipmentLoads);
    const layoutBase = this.optimizer.calculateLoadingLayout(
      loadingOrder,
      recommendedVehicle,
    );
    const draft = await this.getDraft(tourId);
    const draftMap = new Map(
      (draft?.items ?? []).map((it: any) => [it.shipment_id, it]),
    );
    const layout: LoadingLayout = {
      ...layoutBase,
      items: layoutBase.items.map((it) => {
        const d = draftMap.get(it.shipmentId);
        if (!d) return it;
        return {
          ...it,
          xPos: Number(d.x_pos_cm) || 0,
          yPos: Number(d.y_pos_cm) || 0,
        };
      }),
    };

    const warnings = [
      ...this.optimizer.checkOverload(loadingOrder, recommendedVehicle),
      ...layout.items
        .filter(
          (it) =>
            it.xPos + it.length > recommendedVehicle.lengthCm ||
            it.yPos + it.width > recommendedVehicle.widthCm,
        )
        .map((it) => `Sendung ${it.label} liegt ausserhalb des Laderaums`),
    ];

    return {
      recommendedVehicle,
      loadingOrder,
      layout,
      warnings,
      draft: draft
        ? {
            id: draft.id,
            updated_at: draft.updated_at,
          }
        : null,
      draftItems:
        draft?.items?.map((it: any) => ({
          shipmentId: it.shipment_id,
          xPosCm: Number(it.x_pos_cm) || 0,
          yPosCm: Number(it.y_pos_cm) || 0,
          rotationAngle: Number(it.rotation_angle) || 0,
          stackLevel: Math.max(1, Math.round(Number(it.stack_level) || 1)),
        })) ?? [],
    };
  }

  async applyOrder(tourId: string, shipmentIds: string[]) {
    const tour = await this.getTourShipments(tourId);
    const uniqueIds = [...new Set(shipmentIds)];
    if (uniqueIds.length !== shipmentIds.length) {
      throw new Error('shipmentIds enthält Duplikate');
    }
    const existingIds = new Set(tour.shipments.map((s) => s.id));
    if (!shipmentIds.every((id) => existingIds.has(id))) {
      throw new Error('Nicht alle Sendungen gehören zur Tour');
    }

    await this.prisma.$transaction(
      shipmentIds.map((id, index) =>
        this.prisma.shipments.update({
          where: { id },
          data: { tour_position: index + 1 },
        }),
      ),
    );

    return this.optimizeTour(tourId);
  }

  async getDraft(tourId: string) {
    return this.prisma.loading_plan_drafts.findUnique({
      where: { tour_id: tourId },
      include: { items: true },
    });
  }

  async saveDraft(
    tourId: string,
    userId: string | undefined,
    items: Array<{
      shipmentId: string;
      xPosCm: number;
      yPosCm: number;
      rotationAngle?: number;
      stackLevel?: number;
    }>,
  ) {
    const tour = await this.getTourShipments(tourId);
    const tourIds = new Set(tour.shipments.map((s) => s.id));
    if (!items.every((it) => tourIds.has(it.shipmentId))) {
      throw new Error('Draft enthält Sendungen ausserhalb der Tour');
    }

    const draft = await this.prisma.loading_plan_drafts.upsert({
      where: { tour_id: tourId },
      create: {
        tour_id: tourId,
        created_by: userId ?? null,
      },
      update: {
        updated_at: new Date(),
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.loading_plan_draft_items.deleteMany({ where: { draft_id: draft.id } });
      if (items.length > 0) {
        await tx.loading_plan_draft_items.createMany({
          data: items.map((it) => ({
            draft_id: draft.id,
            shipment_id: it.shipmentId,
            x_pos_cm: Math.max(0, Math.round(it.xPosCm)),
            y_pos_cm: Math.max(0, Math.round(it.yPosCm)),
            rotation_angle: Math.round(it.rotationAngle ?? 0),
            stack_level: Math.max(1, Math.round(it.stackLevel ?? 1)),
          })),
        });
      }
    });

    return this.getDraft(tourId);
  }

  async clearDraft(tourId: string) {
    await this.prisma.loading_plan_draft_items.deleteMany({
      where: { draft: { tour_id: tourId } },
    });
    await this.prisma.loading_plan_drafts.deleteMany({
      where: { tour_id: tourId },
    });
    return { success: true };
  }

  private createLayoutSvg(layout: LoadingLayout): string {
    const vw = 800;
    const vh = 200;
    const sx = vw / Math.max(1, layout.vehicle.lengthCm);
    const sy = vh / Math.max(1, layout.vehicle.widthCm);

    const rects = layout.items
      .map((it) => {
        const x = Math.round(it.xPos * sx);
        const y = Math.round(it.yPos * sy);
        const w = Math.max(8, Math.round(it.length * sx));
        const h = Math.max(8, Math.round(it.width * sy));
        const label = it.label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${it.color}" stroke="#1f2937" stroke-width="1" rx="2" />
  <text x="${x + 4}" y="${y + 14}" font-size="10" fill="#111827">${label}</text>
</g>`;
      })
      .join('\n');

    return `<svg width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${vw}" height="${vh}" fill="#f9fafb" stroke="#6b7280" stroke-width="2" />
  <text x="6" y="14" font-size="11" fill="#374151">Hinten</text>
  <text x="${vw - 40}" y="14" font-size="11" fill="#374151">Vorne</text>
  ${rects}
</svg>`;
  }

  private loadTemplate(templateFile: string): string {
    const candidates = [
      path.join(process.cwd(), 'src', 'documents', 'templates', templateFile),
      path.join(__dirname, '..', 'documents', 'templates', templateFile),
      path.join(__dirname, 'templates', templateFile),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    }
    throw new Error(`Template nicht gefunden: ${templateFile}`);
  }

  private async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  async generateLoadingPlanPdf(tourId: string): Promise<Buffer> {
    const tour = await this.getTourShipments(tourId);
    const optimized = await this.optimizeTour(tourId);
    const svg = this.createLayoutSvg(optimized.layout);

    const loadRows = optimized.loadingOrder.map((s, idx) => ({
      nr: idx + 1,
      shipmentNumber: s.shipmentNumber,
      customer: s.customer,
      city: s.deliveryCity,
      dimensions: `${Math.round(s.lengthCm / 1000 * 10) / 10}×${Math.round(
        s.widthCm / 1000 * 10,
      ) / 10}×${Math.round(s.heightCm / 1000 * 10) / 10}m`,
      weightKg: s.weightKg.toLocaleString('de-DE'),
      ldm: s.ldm.toFixed(2),
      stackable: s.isStackable ? 'Ja' : 'Nein',
      stop: s.deliveryOrder,
    }));

    const unloadGroupsMap = new Map<number, { stop: number; customer: string; cities: Set<string>; shipments: string[] }>();
    for (const s of optimized.loadingOrder) {
      const key = s.deliveryOrder;
      if (!unloadGroupsMap.has(key)) {
        unloadGroupsMap.set(key, {
          stop: key,
          customer: s.customer,
          cities: new Set<string>(),
          shipments: [],
        });
      }
      const g = unloadGroupsMap.get(key)!;
      g.cities.add(s.deliveryCity);
      g.shipments.push(s.shipmentNumber);
    }
    const unloadOrder = [...unloadGroupsMap.values()]
      .sort((a, b) => a.stop - b.stop)
      .map((g) => ({
        stop: g.stop,
        customer: g.customer,
        city: [...g.cities].join(', '),
        shipments: g.shipments.join(', '),
      }));

    const template = this.loadTemplate('loading-plan.hbs');
    const html = Handlebars.compile(template)({
      tour: {
        id: tour.id,
        tour_number: tour.tour_number,
        date: tour.tour_date
          ? new Date(tour.tour_date).toLocaleDateString('de-DE')
          : '',
      },
      vehicle: optimized.recommendedVehicle as Vehicle,
      layoutSvg: svg,
      rows: loadRows,
      unloadOrder,
      warnings: optimized.warnings,
      totals: {
        ldm: optimized.layout.totalLdm.toFixed(2),
        weight: optimized.layout.totalWeight.toLocaleString('de-DE'),
        utilizationPercent: optimized.layout.utilizationPercent.toFixed(1),
      },
    });

    return this.htmlToPdf(html);
  }
}

