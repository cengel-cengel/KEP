import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { applyFuelSurcharge, num, roundMoney } from './pricing.utils';
import type { customer_tariffs } from '../../generated/prisma';

export type TariffLookupInput = {
  customerId?: string | null;
  partnerId?: string | null;
  originZip?: string | null;
  originCountry?: string | null;
  destZip: string;
  destCountry: string;
};

@Injectable()
export class CustomerTariffService {
  constructor(private readonly prisma: PrismaService) {}

  private today(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private valid(t: customer_tariffs): boolean {
    if (!t.is_active) return false;
    const day = this.today();
    if (t.valid_from && t.valid_from > day) return false;
    if (t.valid_to && t.valid_to < day) return false;
    return true;
  }

  private normZip(z: string): string {
    return z.replace(/\s/g, '').replace(/^0+/, '') || z.replace(/\s/g, '');
  }

  private destMatch(
    prefix: string | null,
    destZip: string,
  ): { ok: boolean; depth: number } {
    const dz = this.normZip(destZip);
    if (!prefix) return { ok: true, depth: 0 };
    const p = prefix.trim();
    if (dz.startsWith(p)) return { ok: true, depth: p.length };
    return { ok: false, depth: -1 };
  }

  private originMatch(
    t: customer_tariffs,
    originZip: string | undefined,
    originCountry: string | undefined,
  ): boolean {
    if (t.origin_country && originCountry && t.origin_country !== originCountry) {
      return false;
    }
    if (t.origin_zip_prefix && originZip) {
      const oz = this.normZip(originZip);
      if (!oz.startsWith(t.origin_zip_prefix.trim())) return false;
    }
    return true;
  }

  /** Höhere Punktzahl = besser */
  private score(
    t: customer_tariffs,
    input: TariffLookupInput,
    destDepth: number,
  ): number {
    let s = 0;
    if (t.customer_id && t.customer_id === input.customerId) s += 1_000_000;
    else if (t.partner_id && t.partner_id === input.partnerId) s += 500_000;
    else if (!t.customer_id && !t.partner_id) s += 100_000;

    s += destDepth * 10_000;
    s += num(t.priority, 10);
    return s;
  }

  findBestTariff(
    tariffs: customer_tariffs[],
    input: TariffLookupInput,
  ): customer_tariffs | null {
    const day = this.today();
    const candidates = tariffs.filter((t) => {
      if (!this.valid(t)) return false;
      if (t.dest_country !== input.destCountry) return false;
      const dm = this.destMatch(t.dest_zip_prefix, input.destZip);
      if (!dm.ok) return false;
      return this.originMatch(t, input.originZip ?? undefined, input.originCountry ?? undefined);
    });

    if (!candidates.length) return null;

    let best: customer_tariffs | null = null;
    let bestScore = -1;
    for (const t of candidates) {
      const dm = this.destMatch(t.dest_zip_prefix, input.destZip);
      const sc = this.score(t, input, dm.depth);
      if (sc > bestScore) {
        bestScore = sc;
        best = t;
      }
    }
    return best;
  }

  async findTariff(input: TariffLookupInput): Promise<customer_tariffs | null> {
    const all = await this.prisma.customer_tariffs.findMany({
      where: { is_active: true },
    });
    return this.findBestTariff(all, input);
  }

  computeAmount(
    tariff: customer_tariffs,
    ctx: { weightKg: number; ldm: number; isHazmat: boolean },
  ): { amount: number; base: number; fuelExtra: number; adr: number } {
    const w = num(ctx.weightKg);
    const ldm = num(ctx.ldm);
    let base = 0;
    switch (tariff.rate_type) {
      case 'PER_100KG':
        base = (w / 100) * num(tariff.rate);
        break;
      case 'PER_LDM':
        base = ldm * num(tariff.rate);
        break;
      case 'PER_SHIPMENT':
      case 'FLAT':
        base = num(tariff.rate);
        break;
      default:
        base = num(tariff.rate);
    }
    base = Math.max(base, num(tariff.min_charge));
    if (tariff.max_charge != null) {
      base = Math.min(base, num(tariff.max_charge));
    }
    const withFuel = applyFuelSurcharge(base, tariff.fuel_surcharge_pct);
    const adr = ctx.isHazmat ? num(tariff.adr_surcharge) : 0;
    const amount = roundMoney(withFuel + adr);
    return {
      amount,
      base: roundMoney(base),
      fuelExtra: roundMoney(withFuel - base),
      adr,
    };
  }

  async calculateRevenue(shipmentId: string) {
    const s = await this.prisma.shipments.findFirst({
      where: { id: shipmentId, deleted_at: null },
      include: {
        addresses_shipments_loading_address_idToaddresses: true,
        addresses_shipments_delivery_address_idToaddresses: true,
      },
    });
    if (!s) throw new NotFoundException(`Sendung ${shipmentId} nicht gefunden`);

    const load = s.addresses_shipments_loading_address_idToaddresses;
    const del = s.addresses_shipments_delivery_address_idToaddresses;
    const tariff = await this.findTariff({
      customerId: s.customer_id,
      partnerId: s.business_partner_id,
      originZip: load?.zip ?? undefined,
      originCountry: load?.country_code ?? undefined,
      destZip: del?.zip ?? '',
      destCountry: del?.country_code ?? 'DE',
    });

    if (!tariff) {
      await this.prisma.shipments.update({
        where: { id: shipmentId },
        data: { customer_tariff_id: null, calculated_revenue: null },
      });
      return { ok: false, message: 'Kein Kundentarif gefunden' };
    }

    const { amount } = this.computeAmount(tariff, {
      weightKg: num(s.weight_kg),
      ldm: num(s.ldm),
      isHazmat: !!s.is_hazmat,
    });

    await this.prisma.shipments.update({
      where: { id: shipmentId },
      data: {
        customer_tariff_id: tariff.id,
        calculated_revenue: amount,
        freight_revenue: amount,
      },
    });

    return { ok: true, tariffId: tariff.id, freightRevenue: amount };
  }

  async list(customerId?: string) {
    return this.prisma.customer_tariffs.findMany({
      where: customerId ? { customer_id: customerId } : {},
      orderBy: [{ dest_country: 'asc' }, { priority: 'desc' }],
      include: {
        customers: { select: { id: true, name: true, customer_number: true } },
        business_partners: { select: { id: true, name: true, partner_number: true } },
      },
    });
  }

  async create(
    data: Parameters<typeof this.prisma.customer_tariffs.create>[0]['data'],
  ) {
    return this.prisma.customer_tariffs.create({ data });
  }

  async update(
    id: string,
    data: Parameters<typeof this.prisma.customer_tariffs.update>[0]['data'],
  ) {
    await this.ensure(id);
    return this.prisma.customer_tariffs.update({ where: { id }, data });
  }

  private async ensure(id: string) {
    const t = await this.prisma.customer_tariffs.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Tarif ${id} nicht gefunden`);
    return t;
  }

  exportCsv(customerId?: string): Promise<string> {
    return this.list(customerId).then((rows) => {
      const header =
        'customer_id,partner_id,origin_country,origin_zip_prefix,dest_country,dest_zip_prefix,rate_type,rate,min_charge,max_charge,fuel_surcharge_pct,adr_surcharge,priority,valid_from,valid_to,is_active';
      const lines = rows.map((r) =>
        [
          r.customer_id ?? '',
          r.partner_id ?? '',
          r.origin_country ?? '',
          r.origin_zip_prefix ?? '',
          r.dest_country,
          r.dest_zip_prefix ?? '',
          r.rate_type,
          r.rate,
          r.min_charge ?? '',
          r.max_charge ?? '',
          r.fuel_surcharge_pct ?? '',
          r.adr_surcharge ?? '',
          r.priority ?? '',
          r.valid_from ? r.valid_from.toISOString().slice(0, 10) : '',
          r.valid_to?.toISOString().slice(0, 10) ?? '',
          r.is_active ? '1' : '0',
        ].join(','),
      );
      return [header, ...lines].join('\n');
    });
  }

  /** Einfacher CSV-Import (Komma, Header-Zeile wie exportCsv) */
  async importFromCsvBuffer(buf: Buffer) {
    const text = buf.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { imported: 0, errors: ['Keine Datenzeilen'] };
    const header = lines[0].split(',').map((h) => h.trim());
    const idx = (name: string) => header.indexOf(name);
    let imported = 0;
    const errors: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      try {
        const get = (n: string) => {
          const j = idx(n);
          return j >= 0 ? cols[j]?.trim() : '';
        };
        await this.prisma.customer_tariffs.create({
          data: {
            customer_id: get('customer_id') || null,
            partner_id: get('partner_id') || null,
            origin_country: get('origin_country') || null,
            origin_zip_prefix: get('origin_zip_prefix') || null,
            dest_country: get('dest_country') || 'DE',
            dest_zip_prefix: get('dest_zip_prefix') || null,
            rate_type: get('rate_type') || 'PER_SHIPMENT',
            rate: num(get('rate'), 0),
            min_charge: num(get('min_charge'), 0),
            max_charge: get('max_charge') ? num(get('max_charge')) : null,
            fuel_surcharge_pct: num(get('fuel_surcharge_pct'), 0),
            adr_surcharge: num(get('adr_surcharge'), 0),
            priority: Math.floor(num(get('priority'), 10)),
            valid_from: new Date(get('valid_from') || new Date().toISOString().slice(0, 10)),
            valid_to: get('valid_to') ? new Date(get('valid_to')) : null,
            is_active: get('is_active') !== '0',
          },
        });
        imported++;
      } catch (e: unknown) {
        errors.push(`Zeile ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { imported, errors };
  }

  previewRevenue(input: TariffLookupInput & { weightKg: number; ldm: number; isHazmat?: boolean }) {
    return this.findTariff(input).then((tariff) => {
      if (!tariff) return { ok: false as const, message: 'Kein Kundentarif gefunden' };
      const r = this.computeAmount(tariff, {
        weightKg: input.weightKg,
        ldm: input.ldm,
        isHazmat: !!input.isHazmat,
      });
      return {
        ok: true as const,
        tariffId: tariff.id,
        freightRevenue: r.amount,
        breakdown: r,
      };
    });
  }
}
