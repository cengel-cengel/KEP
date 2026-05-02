import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNvStammKundeDto } from './dto/create-nv-stamm-kunde.dto';
import {
  ReorderItemDto,
  UpdateNvStammKundeDto,
} from './dto/update-nv-stamm-kunde.dto';

@Injectable()
export class NvStammKundenService {
  constructor(private readonly prisma: PrismaService) {}

  async listByTour(tourId: string) {
    return this.prisma.nv_stamm_kunden.findMany({
      where: { nv_stamm_tour_id: tourId },
      orderBy: [{ standard_position: 'asc' }, { created_at: 'asc' }],
      include: {
        customer: {
          select: {
            id: true,
            customer_number: true,
            name: true,
          },
        },
      },
    });
  }

  async create(dto: CreateNvStammKundeDto) {
    const tour = await this.prisma.nv_stamm_touren.findUnique({
      where: { id: dto.nv_stamm_tour_id },
      select: { id: true },
    });
    if (!tour) throw new NotFoundException('Stamm-Tour nicht gefunden');

    const customer = await this.prisma.customers.findUnique({
      where: { id: dto.customer_id },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Kunde nicht gefunden');

    const position =
      dto.standard_position ??
      (await this.prisma.nv_stamm_kunden.count({
        where: { nv_stamm_tour_id: dto.nv_stamm_tour_id },
      }));

    return this.prisma.nv_stamm_kunden.create({
      data: {
        nv_stamm_tour_id: dto.nv_stamm_tour_id,
        customer_id: dto.customer_id,
        standard_position: position,
        standard_servicezeit_min: dto.standard_servicezeit_min ?? undefined,
        routing_klasse: dto.routing_klasse ?? undefined,
        notizen: dto.notizen ?? undefined,
        aktiv: dto.aktiv ?? true,
      },
      include: {
        customer: {
          select: { id: true, customer_number: true, name: true },
        },
      },
    });
  }

  async update(id: string, dto: UpdateNvStammKundeDto) {
    const existing = await this.prisma.nv_stamm_kunden.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Stamm-Kunde nicht gefunden');

    return this.prisma.nv_stamm_kunden.update({
      where: { id },
      data: {
        standard_position: dto.standard_position ?? undefined,
        standard_servicezeit_min:
          dto.standard_servicezeit_min === undefined
            ? undefined
            : dto.standard_servicezeit_min,
        routing_klasse:
          dto.routing_klasse === undefined ? undefined : dto.routing_klasse,
        notizen: dto.notizen === undefined ? undefined : dto.notizen,
        aktiv: dto.aktiv ?? undefined,
      },
      include: {
        customer: {
          select: { id: true, customer_number: true, name: true },
        },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.nv_stamm_kunden.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Stamm-Kunde nicht gefunden');
    await this.prisma.nv_stamm_kunden.delete({ where: { id } });
    return { ok: true };
  }

  async reorder(items: ReorderItemDto[]) {
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.nv_stamm_kunden.update({
          where: { id: it.id },
          data: { standard_position: it.standard_position },
        }),
      ),
    );
    return { count: items.length };
  }
}
