import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DatevExportService } from './datev-export.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';

type InvoicePdfItem = {
  position: number;
  description: string;
  quantity: string;
  unit_price: string;
  total_price: string;
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly datevExport: DatevExportService,
  ) {}

  async findAll() {
    return this.prisma.invoices.findMany({
      orderBy: { invoice_date: 'desc' },
      include: {
        customers: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoices.findUnique({
      where: { id },
      include: {
        customers: { select: { id: true, name: true } },
        invoice_items: {
          orderBy: { position: 'asc' },
          include: {
            shipments: { select: { shipment_number: true } },
          },
        },
      },
    });

    if (!invoice) throw new NotFoundException(`Invoice ${id} nicht gefunden`);
    return invoice;
  }

  async createInvoice(dto: CreateInvoiceDto, userId?: string) {
    const shipments = await this.prisma.shipments.findMany({
      where: {
        id: { in: dto.shipmentIds },
        deleted_at: null,
        customer_id: dto.customerId,
      },
      select: {
        id: true,
        shipment_number: true,
        freight_revenue: true,
      },
    });

    if (!shipments.length) {
      throw new BadRequestException(
        'Keine gültigen Sendungen für Rechnung gefunden',
      );
    }

    const net = shipments.reduce(
      (sum, s) => sum + Number(s.freight_revenue ?? 0),
      0,
    );
    if (net <= 0)
      throw new BadRequestException(
        'Rechnungsbetrag ist 0 – bitte freight_revenue prüfen',
      );

    const customer = await this.prisma.customers.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer)
      throw new NotFoundException(`Kunde ${dto.customerId} nicht gefunden`);

    const vatRate = dto.vatRate ?? 19; // default 19%
    const vatAmount = (net * vatRate) / 100;
    const gross = net + vatAmount;

    const invoiceNumber =
      dto.invoiceNumber ?? (await this.generateUniqueInvoiceNumber());
    const createdBy =
      userId ??
      (await this.prisma.users.findFirst({ select: { id: true } }))?.id;
    if (!createdBy) throw new Error('No user found for invoice created_by');

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoices.create({
        data: {
          invoice_number: invoiceNumber,
          customer_id: dto.customerId,
          invoice_date: dto.invoiceDate,
          due_date: dto.dueDate,
          status: 'draft',
          net_amount: net,
          vat_rate: vatRate,
          vat_amount: vatAmount,
          gross_amount: gross,
          notes: dto.notes ?? null,
          created_by: createdBy,
          invoice_items: {
            create: shipments
              .map((s, idx) => ({
                position: idx + 1,
                description: s.shipment_number,
                quantity: 1,
                unit: 'flat',
                unit_price: Number(s.freight_revenue ?? 0),
                total_price: Number(s.freight_revenue ?? 0),
                shipment_id: s.id,
              }))
              .filter((x) => Number(x.total_price) !== 0),
          },
        },
        include: {
          invoice_items: true,
        },
      });

      // Mark shipments as invoiced (best-effort)
      await tx.shipments.updateMany({
        where: { id: { in: dto.shipmentIds } },
        data: { status: 'invoiced' },
      });

      return invoice;
    });
  }

  async createBulkInvoice(
    customerIds: string[],
    dateFrom: Date,
    dateTo: Date,
    userId?: string,
    vatRate?: number,
    notes?: string,
  ) {
    const customers = await this.prisma.customers.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, payment_term_days: true },
    });
    if (!customers.length)
      throw new BadRequestException('Keine Kunden für Bulk-Rechnung gefunden');

    const shipments = await this.prisma.shipments.findMany({
      where: {
        customer_id: { in: customerIds },
        deleted_at: null,
        status: { notIn: ['cancelled', 'invoiced'] },
        delivery_date: { gte: dateFrom, lte: dateTo },
        freight_revenue: { not: null },
      },
      select: {
        id: true,
        customer_id: true,
        shipment_number: true,
        freight_revenue: true,
      },
      orderBy: { customer_id: 'asc' },
    });

    const shipmentsByCustomer = shipments.reduce<
      Record<string, typeof shipments>
    >((acc, s) => {
      const cid = s.customer_id;
      if (!cid) return acc;
      acc[cid] = acc[cid] ?? [];
      acc[cid].push(s);
      return acc;
    }, {});

    const createdBy =
      userId ??
      (await this.prisma.users.findFirst({ select: { id: true } }))?.id;
    if (!createdBy) throw new Error('No user found for invoice created_by');

    const results: any[] = [];

    for (const customer of customers) {
      const group = shipmentsByCustomer[customer.id] ?? [];
      if (!group.length) continue;

      const net = group.reduce(
        (sum, s) => sum + Number(s.freight_revenue ?? 0),
        0,
      );
      const rate = vatRate ?? 19;
      const vatAmount = (net * rate) / 100;
      const gross = net + vatAmount;

      const invoiceNumber = await this.generateUniqueInvoiceNumber();
      const dueDate = new Date(dateFrom);
      dueDate.setDate(
        dueDate.getDate() + Number(customer.payment_term_days ?? 30),
      );

      const invoice = await this.prisma.$transaction(async (tx) => {
        const inv = await tx.invoices.create({
          data: {
            invoice_number: invoiceNumber,
            customer_id: customer.id,
            invoice_date: dateFrom,
            due_date: dueDate,
            status: 'draft',
            net_amount: net,
            vat_rate: rate,
            vat_amount: vatAmount,
            gross_amount: gross,
            notes: notes ?? null,
            created_by: createdBy,
            invoice_items: {
              create: group.map((s, idx) => ({
                position: idx + 1,
                description: s.shipment_number,
                quantity: 1,
                unit: 'flat',
                unit_price: Number(s.freight_revenue ?? 0),
                total_price: Number(s.freight_revenue ?? 0),
                shipment_id: s.id,
              })),
            },
          },
          include: { invoice_items: true },
        });

        await tx.shipments.updateMany({
          where: { id: { in: group.map((s) => s.id) } },
          data: { status: 'invoiced' },
        });

        return inv;
      });

      results.push(invoice);
    }

    return results;
  }

  async generateInvoicePdf(invoiceId: string): Promise<Buffer> {
    const invoice = await this.findOne(invoiceId);

    const template = this.loadTemplate('invoice.hbs');

    const items: InvoicePdfItem[] = invoice.invoice_items.map((it) => ({
      position: it.position,
      description: it.description,
      quantity: String(it.quantity ?? 1),
      unit_price:
        it.unit_price != null ? this.formatEur(Number(it.unit_price)) : '0,00',
      total_price:
        it.total_price != null
          ? this.formatEur(Number(it.total_price))
          : '0,00',
    }));

    const net = Number(invoice.net_amount ?? 0);
    const vatRate = Number(invoice.vat_rate ?? 19);
    const vatAmount = Number(invoice.vat_amount ?? 0);
    const gross = Number(invoice.gross_amount ?? 0);

    const html = Handlebars.compile(template)({
      invoice: {
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date
          ? new Date(invoice.invoice_date).toLocaleDateString('de-DE')
          : '',
        due_date: invoice.due_date
          ? new Date(invoice.due_date).toLocaleDateString('de-DE')
          : '',
        status: invoice.status,
        customer: invoice.customers,
        items,
        net_amount: this.formatEur(net),
        vat_rate: vatRate,
        vat_amount: this.formatEur(vatAmount),
        gross_amount: this.formatEur(gross),
        notes: invoice.notes ?? '',
      },
    });

    return this.htmlToPdf(html);
  }

  async exportDatev(invoiceIds: string[]): Promise<string> {
    if (!invoiceIds.length) throw new BadRequestException('invoiceIds fehlen');
    return this.datevExport.generateExtf(invoiceIds);
  }

  async updateStatus(id: string, status: string) {
    const invoice = await this.prisma.invoices.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${id} nicht gefunden`);
    return this.prisma.invoices.update({
      where: { id },
      data: { status: status as any },
    });
  }

  private async generateUniqueInvoiceNumber(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const num = `INV-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const exists = await this.prisma.invoices.findUnique({
        where: { invoice_number: num },
        select: { id: true },
      });
      if (!exists) return num;
    }
    throw new Error('Konnte invoice_number nicht eindeutig generieren');
  }

  private loadTemplate(templateFile: string): string {
    const candidates = [
      path.join(process.cwd(), 'src', 'invoices', 'templates', templateFile),
      path.join(__dirname, 'templates', templateFile),
      path.join(__dirname, '..', 'templates', templateFile),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    }
    throw new Error(`Template nicht gefunden: ${templateFile}`);
  }

  private formatEur(n: number): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(n);
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
}
