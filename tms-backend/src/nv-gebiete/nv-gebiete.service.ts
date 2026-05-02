import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNvGebietDto } from './dto/update-nv-gebiet.dto';
import { UpdateNvTourGebietDto } from './dto/update-nv-tour-gebiet.dto';

@Injectable()
export class NvGebieteService {
  constructor(private readonly prisma: PrismaService) {}

  async listGebiete() {
    return this.prisma.nv_gebiete.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tour_gebiete: true } },
      },
    });
  }

  async getGebiet(id: string) {
    const g = await this.prisma.nv_gebiete.findUnique({
      where: { id },
      include: {
        tour_gebiete: {
          orderBy: { code: 'asc' },
          include: {
            relation: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!g) throw new NotFoundException('NV-Gebiet nicht gefunden');
    return g;
  }

  async updateGebiet(id: string, dto: UpdateNvGebietDto) {
    const existing = await this.prisma.nv_gebiete.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('NV-Gebiet nicht gefunden');
    return this.prisma.nv_gebiete.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        gebiet_typ: dto.gebiet_typ ?? undefined,
        plz_ranges: dto.plz_ranges ?? undefined,
        aktiv: dto.aktiv ?? undefined,
      },
    });
  }

  async listTourGebiete(gebietId?: string) {
    return this.prisma.nv_tour_gebiete.findMany({
      where: gebietId ? { nv_gebiet_id: gebietId } : undefined,
      orderBy: { code: 'asc' },
      include: {
        nv_gebiet: { select: { id: true, code: true, name: true } },
        relation: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async getTourGebiet(id: string) {
    const t = await this.prisma.nv_tour_gebiete.findUnique({
      where: { id },
      include: {
        nv_gebiet: { select: { id: true, code: true, name: true } },
        relation: { select: { id: true, code: true, name: true } },
      },
    });
    if (!t) throw new NotFoundException('Tour-Gebiet nicht gefunden');
    return t;
  }

  async updateTourGebiet(id: string, dto: UpdateNvTourGebietDto) {
    const existing = await this.prisma.nv_tour_gebiete.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Tour-Gebiet nicht gefunden');
    return this.prisma.nv_tour_gebiete.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        plz_pattern: dto.plz_pattern ?? undefined,
        farbe: dto.farbe ?? undefined,
        aktiv: dto.aktiv ?? undefined,
      },
    });
  }
}
