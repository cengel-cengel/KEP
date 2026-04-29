import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { num, roundMoney } from './pricing.utils';
import type { partner_on_carriage_rates } from '../../generated/prisma';
import type { Express } from 'express';
import * as XLSX from 'xlsx';
import {
  coerceMislabeledFeeRow,
  isLikelyNonAmountLabel,
  mapUnitToField,
  normalizeRateType,
  aoaToImportRows,
  isIrrelevantTariffSheetRow,
  isRateCellNonData,
  parseCsvToObjects,
  parseFeeType,
  pickFeeAmountRaw,
  parseImportMoney,
  parseExcelSerialDate,
  parseIsoDate,
  parsePlzDestination,
  parseZoneRange,
  rowKind,
  type NormalizedImportRow,
} from './partner-rates-import.helper';

@Injectable()
export class PartnerOnCarriageService {
  constructor(private readonly prisma: PrismaService) {}

  private today(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private valid(r: partner_on_carriage_rates): boolean {
    if (!r.is_active) return false;
    const t = this.today();
    if (r.valid_from && r.valid_from > t) return false;
    if (r.valid_to && r.valid_to < t) return false;
    return true;
  }

  async list(partnerId?: string) {
    return this.prisma.partner_on_carriage_rates.findMany({
      where: partnerId ? { partner_id: partnerId } : {},
      orderBy: [{ created_at: 'desc' }],
      include: {
        business_partners: { select: { id: true, name: true, partner_number: true } },
      },
    });
  }

  async create(
    data: Parameters<typeof this.prisma.partner_on_carriage_rates.create>[0]['data'],
  ) {
    return this.prisma.partner_on_carriage_rates.create({ data });
  }

  findBestRate(
    rows: partner_on_carriage_rates[],
    destZip: string,
    destCountry: string,
    distanceKm?: number,
  ): partner_on_carriage_rates | null {
    const active = rows.filter((r) => this.valid(r));
    const dz = destZip.replace(/\s/g, '');

    const plzMatches = active.filter(
      (r) =>
        r.rate_type === 'PLZ' &&
        r.country_code === destCountry &&
        r.zip_prefix &&
        dz.startsWith(r.zip_prefix.trim()),
    );
    if (plzMatches.length) return plzMatches[0];

    if (distanceKm != null) {
      const zone = active.filter(
        (r) =>
          r.rate_type === 'ZONE' &&
          r.zone_km_from != null &&
          r.zone_km_to != null &&
          distanceKm >= num(r.zone_km_from) &&
          distanceKm <= num(r.zone_km_to),
      );
      if (zone.length) return zone[0];
    }

    const fpg = active.filter((r) => r.rate_type === 'FPG');
    if (fpg.length) return fpg[0];

    const any = active.filter((r) => r.rate_type === 'ZONE' || r.rate_type === 'PLZ');
    return any[0] ?? null;
  }

  async findRate(
    partnerId: string,
    destZip: string,
    destCountry: string,
    distanceKm?: number,
  ) {
    const rows = await this.prisma.partner_on_carriage_rates.findMany({
      where: { partner_id: partnerId, is_active: true },
    });
    return this.findBestRate(rows, destZip, destCountry, distanceKm);
  }

  async calculateOnCarriageCost(shipmentId: string) {
    const s = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      include: {
        addresses_shipments_delivery_address_idToaddresses: true,
        outbound_routing: { select: { partner_id: true } },
      },
    });
    if (!s) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const partnerId = s.outbound_routing?.partner_id;
    if (!partnerId) {
      await this.prisma.shipments.update({
        where: { id: shipmentId },
        data: { partner_on_carriage_cost: 0 },
      });
      return { cost: 0, message: 'Kein Nachlauf-Partner im Outbound-Routing' };
    }

    const del = s.addresses_shipments_delivery_address_idToaddresses;
    const rate = await this.findRate(
      partnerId,
      del?.zip ?? '',
      del?.country_code ?? 'DE',
    );

    if (!rate) {
      await this.prisma.shipments.update({
        where: { id: shipmentId },
        data: { partner_on_carriage_cost: 0 },
      });
      return { cost: 0, message: 'Keine Partner-Rate gefunden' };
    }

    const fpg = num(s.chargeable_weight ?? s.weight_kg);
    let cost = 0;
    if (rate.rate_type === 'FPG') {
      cost = (fpg / 100) * num(rate.rate_per_100kg);
      cost = Math.max(cost, num(rate.min_charge));
    } else {
      cost =
        num(rate.rate_per_shipment) +
        (fpg / 100) * num(rate.rate_per_100kg) +
        this.ldmPart(s) * num(rate.rate_per_ldm) +
        num(rate.handling_fee);
      cost = Math.max(cost, num(rate.min_charge));
    }

    cost = roundMoney(cost);
    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: { partner_on_carriage_cost: cost, on_carriage_cost: cost },
    });
    return { cost, rateId: rate.id };
  }

  private ldmPart(s: { ldm?: unknown }): number {
    return num(s.ldm);
  }

  /** Excel-Vorlage Tarifwerk (2 Blätter) */
  buildImportTemplate(): Buffer {
    const wb = XLSX.utils.book_new();
    const tarife = [
      [
        'tariff_type',
        'partner',
        'depot',
        'origin',
        'destination',
        'rate',
        'unit',
        'direction',
        'valid_from',
      ],
      [
        'PLZ',
        '',
        'Berlin',
        'DE',
        '10',
        '12.5',
        'per_stop',
        '',
        '2025-01-01',
      ],
      [
        'ZONE',
        '',
        '',
        'DE',
        '0-80',
        '45',
        'per_stop',
        '',
        '2025-01-01',
      ],
    ];
    const gebuehren = [
      ['fee_type', 'description_de', 'amount_eur', 'unit', 'applies_to'],
      ['HANDLING', 'Bearbeitungsgebühr', '15', 'flat', 'DE'],
      ['MIN_CHARGE', 'Mindestentgelt', '50', 'flat', 'DE'],
    ];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(tarife),
      'Tarife',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(gebuehren),
      'Gebühren',
    );
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.isBuffer(out) ? out : Buffer.from(out as Uint8Array);
  }

  /** .xlsx = ZIP (PK…), altes .xls = OLE (D0 CF 11 E0…) */
  private isExcelWorkbookBuffer(buf: Buffer): boolean {
    if (buf.length < 8) return false;
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      return buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07;
    }
    if (
      buf[0] === 0xd0 &&
      buf[1] === 0xcf &&
      buf[2] === 0x11 &&
      buf[3] === 0xe0
    ) {
      return true;
    }
    return false;
  }

  private shouldParseAsExcel(file: Express.Multer.File): boolean {
    const name = file.originalname?.toLowerCase() ?? '';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return true;
    const mime = (file.mimetype || '').toLowerCase();
    if (
      mime.includes('spreadsheetml.sheet') ||
      mime.includes('spreadsheetml.template') ||
      mime === 'application/vnd.ms-excel'
    ) {
      return true;
    }
    return this.isExcelWorkbookBuffer(file.buffer);
  }

  private parseWorkbook(buf: Buffer): NormalizedImportRow[] {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const out: NormalizedImportRow[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const aoa = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: true,
      }) as unknown[][];
      out.push(...aoaToImportRows(aoa));
    }
    return out;
  }

  private async buildPartnerLookupMap(): Promise<Map<string, string>> {
    const all = await this.prisma.business_partners.findMany({
      select: { id: true, name: true, partner_number: true },
    });
    const m = new Map<string, string>();
    for (const p of all) {
      m.set(p.name.trim().toLowerCase(), p.id);
      m.set(String(p.partner_number).trim().toLowerCase(), p.id);
    }
    return m;
  }

  /**
   * Zeilen-Partner nur wenn exakt in Stammdaten; sonst gewählter Import-Partner
   * (vermeidet Fehler bei Leistungstext in der Partner-Spalte / Spaltenversatz).
   */
  private resolvePartnerForRow(
    partnerCell: string | undefined,
    defaultId: string,
    lookup: Map<string, string>,
  ): string {
    const key = (partnerCell ?? '').trim().toLowerCase();
    if (!key) return defaultId;
    if (
      /^[a-z][a-z0-9_]{0,42}$/.test(key) &&
      key.includes('_') &&
      !lookup.has(key)
    ) {
      return defaultId;
    }
    return lookup.get(key) ?? defaultId;
  }

  private async findMatchingRate(
    partnerId: string,
    rateType: string,
    keys: {
      zip_prefix: string | null;
      country_code: string | null;
      zone_km_from: number | null;
      zone_km_to: number | null;
      zone_number: number | null;
    },
  ) {
    return this.prisma.partner_on_carriage_rates.findFirst({
      where: {
        partner_id: partnerId,
        rate_type: rateType,
        zip_prefix: keys.zip_prefix,
        country_code: keys.country_code,
        zone_km_from: keys.zone_km_from,
        zone_km_to: keys.zone_km_to,
        zone_number: keys.zone_number,
      },
    });
  }

  private ratesEqual(
    a: partner_on_carriage_rates,
    patch: {
      rate_per_shipment: number;
      rate_per_100kg: number;
      rate_per_ldm: number;
      min_charge: number;
      handling_fee: number;
      valid_from: Date;
    },
  ): boolean {
    if (!a.valid_from) return false;
    const vf = a.valid_from instanceof Date ? a.valid_from : new Date(a.valid_from);
    return (
      num(a.rate_per_shipment) === patch.rate_per_shipment &&
      num(a.rate_per_100kg) === patch.rate_per_100kg &&
      num(a.rate_per_ldm) === patch.rate_per_ldm &&
      num(a.min_charge) === patch.min_charge &&
      num(a.handling_fee) === patch.handling_fee &&
      vf.getTime() === patch.valid_from.getTime()
    );
  }

  private async processTariffRow(
    row: NormalizedImportRow,
    partnerId: string,
    line: number,
  ): Promise<'ok' | 'skip' | 'irrelevant'> {
    if (isIrrelevantTariffSheetRow(row)) {
      return 'irrelevant';
    }

    const rt = normalizeRateType(row.tariff_type);
    if (!rt) {
      const tt = (row.tariff_type || '').trim();
      if (tt.length > 50 || /^[\d.\s\-–]+/.test(tt)) {
        return 'irrelevant';
      }
      throw new Error(`Unbekannter tariff_type "${row.tariff_type}"`);
    }

    const rateVal = parseImportMoney(row.rate);
    if (rateVal == null) {
      if (isRateCellNonData(row.rate)) {
        return 'irrelevant';
      }
      throw new Error(`Ungültiger Betrag "${row.rate}"`);
    }

    const unitField = mapUnitToField(row.unit || 'per_stop');
    const field = unitField?.field ?? 'rate_per_shipment';

    const validFrom =
      parseIsoDate(row.valid_from) ??
      parseExcelSerialDate(row.valid_from) ??
      this.today();

    let zip_prefix: string | null = null;
    let country_code: string | null = null;
    let zone_km_from: number | null = null;
    let zone_km_to: number | null = null;
    let zone_number: number | null = null;

    if (rt === 'PLZ') {
      const plz = parsePlzDestination(row.destination || '', row.origin || 'DE');
      if (!plz || !plz.zip_prefix) {
        throw new Error(
          `PLZ-Ziel ungültig (destination="${row.destination}", origin="${row.origin}")`,
        );
      }
      zip_prefix = plz.zip_prefix;
      country_code = plz.country_code;
    } else if (rt === 'ZONE') {
      const z = parseZoneRange(row.destination || '');
      if (!z) {
        throw new Error(`Zonenbereich ungültig: "${row.destination}"`);
      }
      zone_km_from = z.from;
      zone_km_to = z.to;
      zone_number =
        z.zoneNumber ?? Math.min(99, Math.max(1, Math.ceil(z.to / 50)));
    } else {
      country_code =
        (row.origin || 'DE').trim().toUpperCase().slice(0, 2) || 'DE';
    }

    const patch: {
      rate_per_shipment: number;
      rate_per_100kg: number;
      rate_per_ldm: number;
      min_charge: number;
      handling_fee: number;
      valid_from: Date;
    } = {
      rate_per_shipment: 0,
      rate_per_100kg: 0,
      rate_per_ldm: 0,
      min_charge: 0,
      handling_fee: 0,
      valid_from: validFrom,
    };
    patch[field] = rateVal;

    const existing = await this.findMatchingRate(partnerId, rt, {
      zip_prefix,
      country_code,
      zone_km_from,
      zone_km_to,
      zone_number,
    });

    if (existing) {
      const merged = {
        rate_per_shipment:
          field === 'rate_per_shipment'
            ? rateVal
            : num(existing.rate_per_shipment),
        rate_per_100kg:
          field === 'rate_per_100kg' ? rateVal : num(existing.rate_per_100kg),
        rate_per_ldm:
          field === 'rate_per_ldm' ? rateVal : num(existing.rate_per_ldm),
        min_charge:
          field === 'min_charge' ? rateVal : num(existing.min_charge),
        handling_fee: num(existing.handling_fee),
        valid_from: validFrom,
      };
      if (this.ratesEqual(existing, merged)) {
        return 'skip';
      }
      await this.prisma.partner_on_carriage_rates.update({
        where: { id: existing.id },
        data: {
          rate_per_shipment: merged.rate_per_shipment,
          rate_per_100kg: merged.rate_per_100kg,
          rate_per_ldm: merged.rate_per_ldm,
          min_charge: merged.min_charge,
          handling_fee: merged.handling_fee,
          valid_from: merged.valid_from,
        },
      });
      return 'ok';
    }

    await this.prisma.partner_on_carriage_rates.create({
      data: {
        partner_id: partnerId,
        rate_type: rt,
        zip_prefix,
        country_code,
        zone_km_from,
        zone_km_to,
        zone_number,
        rate_per_shipment: patch.rate_per_shipment,
        rate_per_100kg: patch.rate_per_100kg,
        rate_per_ldm: patch.rate_per_ldm,
        min_charge: patch.min_charge,
        handling_fee: patch.handling_fee,
        valid_from: validFrom,
        valid_to: null,
        is_active: true,
      },
    });
    return 'ok';
  }

  private async processFeeRow(
    row: NormalizedImportRow,
    partnerId: string,
    line: number,
  ): Promise<'ok' | 'skip' | 'irrelevant'> {
    const amountStr = pickFeeAmountRaw(row);
    const amt = parseImportMoney(amountStr);
    if (amt == null) {
      if (isRateCellNonData(amountStr) || isLikelyNonAmountLabel(amountStr)) {
        return 'irrelevant';
      }
      throw new Error(`Ungültiger Betrag "${amountStr}"`);
    }
    let feeField = parseFeeType(row.fee_type);
    if (!feeField && amountStr) {
      feeField = 'handling_fee';
    }
    if (!feeField) {
      throw new Error(`Unbekannter fee_type "${row.fee_type}"`);
    }

    const cc =
      (row.applies_to || 'DE').trim().toUpperCase().slice(0, 2) || 'DE';

    const existing = await this.prisma.partner_on_carriage_rates.findFirst({
      where: {
        partner_id: partnerId,
        rate_type: 'ZONE',
        zone_number: 99,
        zone_km_from: 0,
        zone_km_to: 999999,
        country_code: cc,
      },
    });

    if (existing) {
      const nextHandling =
        feeField === 'handling_fee' ? amt : num(existing.handling_fee);
      const nextMin =
        feeField === 'min_charge' ? amt : num(existing.min_charge);
      if (
        num(existing.handling_fee) === nextHandling &&
        num(existing.min_charge) === nextMin
      ) {
        return 'skip';
      }
      await this.prisma.partner_on_carriage_rates.update({
        where: { id: existing.id },
        data: {
          handling_fee: nextHandling,
          min_charge: nextMin,
        },
      });
      return 'ok';
    }

    await this.prisma.partner_on_carriage_rates.create({
      data: {
        partner_id: partnerId,
        rate_type: 'ZONE',
        zone_number: 99,
        zone_km_from: 0,
        zone_km_to: 999999,
        zip_prefix: null,
        country_code: cc,
        rate_per_shipment: 0,
        rate_per_100kg: 0,
        rate_per_ldm: 0,
        min_charge: feeField === 'min_charge' ? amt : 0,
        handling_fee: feeField === 'handling_fee' ? amt : 0,
        valid_from: this.today(),
        valid_to: null,
        is_active: true,
      },
    });
    return 'ok';
  }

  async importPartnerRates(
    file: Express.Multer.File | undefined,
    partnerId: string,
  ): Promise<{
    imported: number;
    skipped: number;
    skippedEmpty: number;
    skippedUnchanged: number;
    skippedIrrelevant: number;
    errors: string[];
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Keine Datei');
    }

    const partner = await this.prisma.business_partners.findFirst({
      where: { id: partnerId },
      select: { id: true, name: true, partner_number: true },
    });
    if (!partner) {
      throw new BadRequestException('Partner nicht gefunden');
    }

    const lookup = await this.buildPartnerLookupMap();
    lookup.set(partner.name.trim().toLowerCase(), partner.id);
    lookup.set(String(partner.partner_number).trim().toLowerCase(), partner.id);

    const rows = this.shouldParseAsExcel(file)
      ? this.parseWorkbook(file.buffer)
      : parseCsvToObjects(file.buffer);

    let imported = 0;
    let skipped = 0;
    let skippedEmpty = 0;
    let skippedUnchanged = 0;
    let skippedIrrelevant = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = coerceMislabeledFeeRow(rows[i]);
      const line = i + 2;
      const kind = rowKind(row);
      if (kind === 'empty') {
        skippedEmpty++;
        skipped++;
        continue;
      }

      const pid = this.resolvePartnerForRow(row.partner, partnerId, lookup);

      try {
        if (kind === 'fee') {
          const r = await this.processFeeRow(row, pid, line);
          if (r === 'skip') {
            skippedUnchanged++;
            skipped++;
          } else if (r === 'irrelevant') {
            skippedIrrelevant++;
            skipped++;
          } else imported++;
        } else {
          const r = await this.processTariffRow(row, pid, line);
          if (r === 'skip') {
            skippedUnchanged++;
            skipped++;
          } else if (r === 'irrelevant') {
            skippedIrrelevant++;
            skipped++;
          } else imported++;
        }
      } catch (e) {
        errors.push(
          `Zeile ${line}: ${(e as Error).message}`,
        );
      }
    }

    return {
      imported,
      skipped,
      skippedEmpty,
      skippedUnchanged,
      skippedIrrelevant,
      errors,
    };
  }
}
