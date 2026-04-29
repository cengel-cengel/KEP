import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'node:fs';
import * as path from 'node:path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';

type AddressView = {
  name: string;
  street: string;
  zip: string;
  city: string;
  country_code: string;
};

type CmrShipmentRow = {
  position: number;
  shipment_number: string;
  package_count: number;
  package_type: string;
  weight_kg: string;
  ldm: string;
};

type LoadingListShipmentRow = {
  position: number;
  shipment_number: string;
  customer_name: string;
  load_city: string;
  unload_city: string;
  unload_country: string;
  package_count: number;
  weight_kg: string;
  ldm: string;
  note: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateDriverQrCode(tourId: string): Promise<string> {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      select: { driver_access_token: true },
    });
    if (!tour?.driver_access_token) {
      throw new NotFoundException(
        `Tour ${tourId}: kein Fahrer-Zugangstoken (Tour freigeben)`,
      );
    }
    const base =
      this.config.get<string>('FRONTEND_URL') ??
      process.env.FRONTEND_URL ??
      'http://localhost:5173';
    const url = `${base.replace(/\/$/, '')}/driver/access/${tour.driver_access_token}`;
    return QRCode.toDataURL(url, { width: 150, margin: 1 });
  }

  async generateCmr(tourId: string): Promise<Buffer> {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        subcontractors: true,
        shipments: {
          where: { deleted_at: null },
          orderBy: { tour_position: 'asc' },
          include: {
            addresses_shipments_loading_address_idToaddresses: true,
            addresses_shipments_delivery_address_idToaddresses: true,
            customers: { select: { name: true } },
          },
        },
      },
    });

    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);
    if (!tour.shipments?.length)
      throw new NotFoundException(`Tour ${tourId} hat keine Sendungen`);

    let driverQrCode: string | null = null;
    let driverPin: string | null = tour.driver_pin ?? null;
    try {
      if (tour.driver_access_token) {
        driverQrCode = await this.generateDriverQrCode(tourId);
      }
    } catch {
      driverQrCode = null;
    }

    const firstShipment = tour.shipments[0];
    const loadingAddress =
      firstShipment.addresses_shipments_loading_address_idToaddresses;
    const deliveryAddress =
      firstShipment.addresses_shipments_delivery_address_idToaddresses;

    const loading: AddressView = {
      name: loadingAddress?.name ?? '',
      street: loadingAddress?.street ?? '',
      zip: loadingAddress?.zip ?? '',
      city: loadingAddress?.city ?? '',
      country_code: loadingAddress?.country_code ?? 'DE',
    };

    const recipient: AddressView = {
      name: deliveryAddress?.name ?? '',
      street: deliveryAddress?.street ?? '',
      zip: deliveryAddress?.zip ?? '',
      city: deliveryAddress?.city ?? '',
      country_code: deliveryAddress?.country_code ?? 'DE',
    };

    const subcontractorName = tour.subcontractors?.name ?? '–';

    const shipments: CmrShipmentRow[] = tour.shipments.map((s, idx) => ({
      position: idx + 1,
      shipment_number: s.shipment_number,
      package_count: s.package_count ?? 0,
      package_type: s.package_type ?? 'other',
      weight_kg: s.weight_kg != null ? String(s.weight_kg) : '0',
      ldm: s.ldm != null ? String(s.ldm) : '0',
    }));

    const template = this.loadTemplate('cmr.hbs');
    const html = Handlebars.compile(template)({
      tour: {
        tour_number: tour.tour_number,
        tour_date: tour.tour_date
          ? new Date(tour.tour_date).toLocaleDateString('de-DE')
          : '',
        subcontractorName,
      },
      sender: loading,
      receiver: recipient,
      place_of_reception: loading.city,
      place_of_issuance: 'KED Global Logistics',
      shipments,
      driverQrCode,
      driverPin: driverPin ?? '–',
    });

    return this.htmlToPdf(html);
  }

  async generateLoadingList(tourId: string): Promise<Buffer> {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        subcontractors: true,
        shipments: {
          where: { deleted_at: null },
          orderBy: { tour_position: 'asc' },
          include: {
            customers: { select: { name: true } },
            addresses_shipments_loading_address_idToaddresses: true,
            addresses_shipments_delivery_address_idToaddresses: true,
          },
        },
      },
    });

    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);
    if (!tour.shipments?.length)
      throw new NotFoundException(`Tour ${tourId} hat keine Sendungen`);

    const shipments: LoadingListShipmentRow[] = tour.shipments.map((s, idx) => {
      const loadingAddress =
        s.addresses_shipments_loading_address_idToaddresses;
      const deliveryAddress =
        s.addresses_shipments_delivery_address_idToaddresses;

      return {
        position: idx + 1,
        shipment_number: s.shipment_number,
        customer_name: s.customers?.name ?? '–',
        load_city: loadingAddress?.city ?? '–',
        unload_city: deliveryAddress?.city ?? '–',
        unload_country: deliveryAddress?.country_code ?? 'DE',
        package_count: s.package_count ?? 0,
        weight_kg: s.weight_kg != null ? String(s.weight_kg) : '0',
        ldm: s.ldm != null ? String(s.ldm) : '0',
        note: s.customer_note ?? s.comment ?? '',
      };
    });

    const totals = shipments.reduce(
      (acc, s) => {
        acc.totalPackageCount += Number(s.package_count ?? 0);
        acc.totalWeightKg += Number(s.weight_kg ?? 0);
        acc.totalLdm += Number(s.ldm ?? 0);
        return acc;
      },
      { totalPackageCount: 0, totalWeightKg: 0, totalLdm: 0 },
    );

    const template = this.loadTemplate('loading-list.hbs');
    const html = Handlebars.compile(template)({
      tour: {
        tour_number: tour.tour_number,
        tour_date: tour.tour_date
          ? new Date(tour.tour_date).toLocaleDateString('de-DE')
          : '',
        subcontractorName: tour.subcontractors?.name ?? '–',
        vehicle_plate: tour.vehicle_plate ?? '',
      },
      shipments,
      totals: {
        totalPackageCount: totals.totalPackageCount,
        totalWeightKg: totals.totalWeightKg,
        totalLdm: totals.totalLdm,
      },
    });

    return this.htmlToPdf(html);
  }

  async generateTourList(tourId: string): Promise<Buffer> {
    const tour = await this.prisma.tours.findUnique({
      where: { id: tourId },
      include: {
        subcontractors: true,
        shipments: {
          where: { deleted_at: null },
          orderBy: { tour_position: 'asc' },
          include: {
            customers: { select: { name: true } },
            addresses_shipments_loading_address_idToaddresses: {
              select: { city: true, name: true, zip: true },
            },
            addresses_shipments_delivery_address_idToaddresses: {
              select: { city: true, name: true, zip: true },
            },
          },
        },
      },
    });

    if (!tour) throw new NotFoundException(`Tour ${tourId} nicht gefunden`);

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #000; padding: 6px; font-size: 12px; }
      th { background: #f3f4f6; text-align: left; }
    </style>
  </head>
  <body>
    <h1>Tourenliste – ${tour.tour_number}</h1>
    <div>Datum: ${tour.tour_date ? new Date(tour.tour_date).toLocaleDateString('de-DE') : ''}</div>
    <div>SUB: ${tour.subcontractors?.name ?? '–'}</div>
    <br />
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Sendung</th>
          <th>Kunde</th>
          <th>Von</th>
          <th>Nach</th>
        </tr>
      </thead>
      <tbody>
        ${tour.shipments
          .map((s, idx) => {
            const from = s.addresses_shipments_loading_address_idToaddresses;
            const to = s.addresses_shipments_delivery_address_idToaddresses;
            return `<tr>
              <td>${idx + 1}</td>
              <td>${s.shipment_number}</td>
              <td>${s.customers?.name ?? '–'}</td>
              <td>${from?.zip ?? ''} ${from?.city ?? ''}</td>
              <td>${to?.zip ?? ''} ${to?.city ?? ''}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  </body>
</html>`;

    return this.htmlToPdf(html);
  }

  sendOutgoingBorderoPlaceholder(tourId: string): Promise<void> {
    // Placeholder for IDS/LSU integration.
    void tourId;
    return Promise.resolve();
  }

  private loadTemplate(templateFile: string): string {
    // Works in dev (src exists) and (best-effort) in dist.
    const candidates = [
      path.join(process.cwd(), 'src', 'documents', 'templates', templateFile),
      path.join(__dirname, 'templates', templateFile),
      path.join(__dirname, '..', 'templates', templateFile),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    }

    throw new Error(`Template nicht gefunden: ${templateFile}`);
  }

  private async htmlToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      // Required in many environments (including CI/containers)
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
}
