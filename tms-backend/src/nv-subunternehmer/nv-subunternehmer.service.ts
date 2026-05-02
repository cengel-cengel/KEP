import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNvSubunternehmerDto } from './dto/create-nv-subunternehmer.dto';
import { UpdateNvSubunternehmerDto } from './dto/update-nv-subunternehmer.dto';

@Injectable()
export class NvSubunternehmerService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSubcontractor(bpId: string) {
    const bp = await this.prisma.business_partners.findUnique({
      where: { id: bpId },
      select: { id: true, name: true, partner_type: true },
    });
    if (!bp) {
      throw new BadRequestException(
        `Business-Partner ${bpId} nicht gefunden`,
      );
    }
    if (bp.partner_type !== 'SUBCONTRACTOR') {
      throw new BadRequestException(
        `Business-Partner muss partner_type='SUBCONTRACTOR' haben (aktuell '${bp.partner_type}')`,
      );
    }
    return bp;
  }

  async list(tourGebietId?: string) {
    return this.prisma.nv_subunternehmer.findMany({
      where: tourGebietId ? { nv_tour_gebiet_id: tourGebietId } : undefined,
      orderBy: { name: 'asc' },
      include: {
        nv_tour_gebiet: { select: { id: true, code: true, name: true } },
        business_partner: {
          select: { id: true, partner_number: true, name: true },
        },
      },
    });
  }

  async getOne(id: string) {
    const s = await this.prisma.nv_subunternehmer.findUnique({
      where: { id },
      include: {
        nv_tour_gebiet: { select: { id: true, code: true, name: true } },
        business_partner: {
          select: { id: true, partner_number: true, name: true },
        },
      },
    });
    if (!s) throw new NotFoundException('NV-Subunternehmer nicht gefunden');
    return s;
  }

  async create(dto: CreateNvSubunternehmerDto) {
    const bp = await this.assertSubcontractor(dto.business_partner_id);
    return this.prisma.nv_subunternehmer.create({
      data: {
        name: bp.name.slice(0, 200),
        business_partner_id: bp.id,
        nv_tour_gebiet_id: dto.nv_tour_gebiet_id ?? undefined,
        tarif_typ: dto.tarif_typ ?? 'TAGESPAUSCHALE',
        tarif_pro_stop_eur: dto.tarif_pro_stop_eur ?? undefined,
        tarif_tagespauschale_eur: dto.tarif_tagespauschale_eur ?? undefined,
        fahrzeug_typ: dto.fahrzeug_typ ?? undefined,
        notiz: dto.notiz ?? undefined,
        aktiv: dto.aktiv ?? true,
      },
      include: {
        business_partner: {
          select: { id: true, partner_number: true, name: true },
        },
      },
    });
  }

  async update(id: string, dto: UpdateNvSubunternehmerDto) {
    const existing = await this.prisma.nv_subunternehmer.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException('NV-Subunternehmer nicht gefunden');

    let nameUpdate: string | undefined;
    let bpUpdate: string | undefined;
    if (
      dto.business_partner_id &&
      dto.business_partner_id !== existing.business_partner_id
    ) {
      const bp = await this.assertSubcontractor(dto.business_partner_id);
      bpUpdate = bp.id;
      nameUpdate = bp.name.slice(0, 200);
    }

    return this.prisma.nv_subunternehmer.update({
      where: { id },
      data: {
        business_partner_id: bpUpdate ?? undefined,
        name: nameUpdate ?? undefined,
        nv_tour_gebiet_id:
          dto.nv_tour_gebiet_id === undefined
            ? undefined
            : dto.nv_tour_gebiet_id,
        tarif_typ: dto.tarif_typ ?? undefined,
        tarif_pro_stop_eur:
          dto.tarif_pro_stop_eur === undefined
            ? undefined
            : dto.tarif_pro_stop_eur,
        tarif_tagespauschale_eur:
          dto.tarif_tagespauschale_eur === undefined
            ? undefined
            : dto.tarif_tagespauschale_eur,
        fahrzeug_typ:
          dto.fahrzeug_typ === undefined ? undefined : dto.fahrzeug_typ,
        notiz: dto.notiz === undefined ? undefined : dto.notiz,
        aktiv: dto.aktiv ?? undefined,
      },
      include: {
        business_partner: {
          select: { id: true, partner_number: true, name: true },
        },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.nv_subunternehmer.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException('NV-Subunternehmer nicht gefunden');
    await this.prisma.nv_subunternehmer.delete({ where: { id } });
    return { ok: true };
  }

  async bulkSetAktiv(ids: string[], aktiv: boolean) {
    const result = await this.prisma.nv_subunternehmer.updateMany({
      where: { id: { in: ids } },
      data: { aktiv },
    });
    return { count: result.count };
  }
}
