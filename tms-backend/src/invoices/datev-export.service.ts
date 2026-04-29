// ============================================================
// TMS – DATEV Export Service
// src/invoices/datev-export.service.ts
// Erzeugt DATEV EXTF-Format (Buchungsstapel)
// ============================================================

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DatevExportService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async generateExtf(invoiceIds: string[]): Promise<string> {
    const invoices = await this.prisma.invoices.findMany({
      where: { id: { in: invoiceIds }, status: { in: ['sent', 'paid'] } },
      include: {
        customers: { select: { name: true, datev_account: true } },
        invoice_items: true,
      },
    });

    if (!invoices.length) throw new Error('Keine gültigen Rechnungen gefunden');

    const beraterNr = this.config.get('DATEV_BERATER_NUMBER', '12345');
    const mandantNr = this.config.get('DATEV_MANDANT_NUMBER', '67890');
    const now = new Date();

    const header1 = [
      '"EXTF"',
      '700',
      '21',
      '"Buchungsstapel"',
      '12',
      this.formatDatevDateTime(now),
      '',
      '"TMS System"',
      '',
      '',
      beraterNr,
      mandantNr,
      this.formatDatevDate(new Date(now.getFullYear(), 0, 1)),
      '4',
      this.formatDatevDate(invoices[0].invoice_date),
      this.formatDatevDate(invoices[invoices.length - 1].invoice_date),
      '"TMS-Rechnungsexport"',
      '',
      '1',
      '0',
      '0',
      'EUR',
    ].join(';');

    const header2 = [
      '"Umsatz (ohne Soll/Haben-Kz)"',
      '"Soll/Haben-Kennzeichen"',
      '"WKZ Umsatz"',
      '"Kurs"',
      '"Basis-Umsatz"',
      '"WKZ Basis-Umsatz"',
      '"Konto"',
      '"Gegenkonto (ohne BU-Schlüssel)"',
      '"BU-Schlüssel"',
      '"Belegdatum"',
      '"Belegfeld 1"',
      '"Belegfeld 2"',
      '"Skonto"',
      '"Buchungstext"',
      '"Postensperre"',
      '"Diverse Adressnummer"',
      '"Geschäftspartnerbank"',
      '"Sachverhalt"',
      '"Zinssperre"',
      '"Beleglink"',
      '"Beleginfo - Art 1"',
      '"Beleginfo - Inhalt 1"',
    ].join(';');

    const lines: string[] = [header1, header2];

    for (const invoice of invoices) {
      const revenueAccount = this.getRevenueAccount(invoice);
      const debtorAccount = invoice.customers.datev_account || '10000';

      lines.push(
        [
          this.formatAmount(Number(invoice.net_amount)),
          'H',
          'EUR',
          '',
          '',
          '',
          revenueAccount,
          debtorAccount,
          this.getBuKey(Number(invoice.vat_rate)),
          this.formatDatevDate(invoice.invoice_date),
          invoice.invoice_number,
          '',
          '',
          `"${invoice.customers.name.substring(0, 60)}"`,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ].join(';'),
      );
    }

    const csv = lines.join('\r\n');

    await this.prisma.invoices.updateMany({
      where: { id: { in: invoiceIds } },
      data: { datev_exported_at: new Date() },
    });

    return csv;
  }

  private formatAmount(amount: number): string {
    return amount.toFixed(2).replace('.', ',');
  }

  private formatDatevDate(date: Date): string {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}${month}`;
  }

  private formatDatevDateTime(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hour}${min}${sec}000`;
  }

  private getRevenueAccount(invoice: any): string {
    if (Number(invoice.vat_rate) === 19) return '8400';
    if (Number(invoice.vat_rate) === 7) return '8125';
    return '8300';
  }

  private getBuKey(vatRate: number): string {
    if (vatRate === 19) return '';
    if (vatRate === 7) return '2';
    return '4';
  }
}
