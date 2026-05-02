import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNvStammTourDto } from './dto/create-nv-stamm-tour.dto';
import { UpdateNvStammTourDto } from './dto/update-nv-stamm-tour.dto';

function timeToDate(hhmm?: string | null): Date | null | undefined {
  if (hhmm === undefined) return undefined;
  if (hhmm === null) return null;
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

function timeToString(d: Date | null | undefined): string | null {
  if (!d) return null;
  const iso = d.toISOString();
  return iso.slice(11, 16); // HH:mm
}

function shapeRow<T extends { start_zeit: Date | null }>(row: T) {
  return { ...row, start_zeit: timeToString(row.start_zeit) };
}

@Injectable()
export class NvStammTourenService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tourGebietId?: string) {
    const rows = await this.prisma.nv_stamm_touren.findMany({
      where: tourGebietId ? { nv_tour_gebiet_id: tourGebietId } : undefined,
      orderBy: { code: 'asc' },
      include: {
        nv_tour_gebiet: { select: { id: true, code: true, name: true } },
        default_subunternehmer: { select: { id: true, name: true } },
      },
    });
    return rows.map(shapeRow);
  }

  async getOne(id: string) {
    const row = await this.prisma.nv_stamm_touren.findUnique({
      where: { id },
      include: {
        nv_tour_gebiet: { select: { id: true, code: true, name: true } },
        default_subunternehmer: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException('Stamm-Tour nicht gefunden');
    return shapeRow(row);
  }

  async create(dto: CreateNvStammTourDto) {
    const created = await this.prisma.nv_stamm_touren.create({
      data: {
        code: dto.code,
        name: dto.name,
        nv_tour_gebiet_id: dto.nv_tour_gebiet_id,
        default_subunternehmer_id: dto.default_subunternehmer_id ?? undefined,
        wochentage: dto.wochentage,
        start_zeit: timeToDate(dto.start_zeit) ?? undefined,
        fahrzeug_typ: dto.fahrzeug_typ ?? undefined,
        aktiv: dto.aktiv ?? true,
      },
    });
    return shapeRow(created);
  }

  async update(id: string, dto: UpdateNvStammTourDto) {
    const existing = await this.prisma.nv_stamm_touren.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Stamm-Tour nicht gefunden');

    const updated = await this.prisma.nv_stamm_touren.update({
      where: { id },
      data: {
        code: dto.code ?? undefined,
        name: dto.name ?? undefined,
        nv_tour_gebiet_id: dto.nv_tour_gebiet_id ?? undefined,
        default_subunternehmer_id:
          dto.default_subunternehmer_id === undefined
            ? undefined
            : dto.default_subunternehmer_id,
        wochentage: dto.wochentage ?? undefined,
        start_zeit:
          dto.start_zeit === undefined ? undefined : timeToDate(dto.start_zeit),
        fahrzeug_typ:
          dto.fahrzeug_typ === undefined ? undefined : dto.fahrzeug_typ,
        aktiv: dto.aktiv ?? undefined,
      },
    });
    return shapeRow(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.nv_stamm_touren.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Stamm-Tour nicht gefunden');
    await this.prisma.nv_stamm_touren.delete({ where: { id } });
    return { ok: true };
  }
}
