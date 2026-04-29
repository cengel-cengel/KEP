import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubcontractorDto } from './dto/create-subcontractor.dto';
import { UpdateSubcontractorDto } from './dto/update-subcontractor.dto';

@Injectable()
export class SubcontractorsService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateSubcontractorNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('subcontractor_number_seq')
    `;
    const value = result[0].nextval.toString().padStart(5, '0');
    return `S${value}`;
  }

  async findAll(search?: string) {
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { subcontractor_number: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.subcontractors.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const subcontractor = await this.prisma.subcontractors.findUnique({
      where: { id },
    });
    if (!subcontractor) {
      throw new NotFoundException('Subcontractor not found');
    }
    return subcontractor;
  }

  async create(dto: CreateSubcontractorDto, userId: string) {
    const number = await this.generateSubcontractorNumber();

    return this.prisma.subcontractors.create({
      data: {
        subcontractor_number: number,
        name: dto.name,
        vat_id: dto.vatId,
        street: dto.street,
        zip: dto.zip,
        city: dto.city,
        country_code: dto.countryCode ?? 'DE',
        contact_name: dto.contactName,
        contact_phone: dto.contactPhone,
        contact_email: dto.contactEmail,
        datev_account: dto.datevAccount,
        payment_term_days: dto.paymentTermDays,
        has_adr_license: dto.hasAdrLicense,
        has_temperature: dto.hasTemperature,
        max_weight_kg: dto.maxWeightKg,
        max_ldm: dto.maxLdm,
        notes: dto.notes,
        created_by: userId,
      },
    });
  }

  async update(id: string, dto: UpdateSubcontractorDto) {
    await this.ensureExists(id);

    return this.prisma.subcontractors.update({
      where: { id },
      data: {
        name: dto.name,
        vat_id: dto.vatId,
        street: dto.street,
        zip: dto.zip,
        city: dto.city,
        country_code: dto.countryCode,
        contact_name: dto.contactName,
        contact_phone: dto.contactPhone,
        contact_email: dto.contactEmail,
        datev_account: dto.datevAccount,
        payment_term_days: dto.paymentTermDays,
        has_adr_license: dto.hasAdrLicense,
        has_temperature: dto.hasTemperature,
        max_weight_kg: dto.maxWeightKg,
        max_ldm: dto.maxLdm,
        notes: dto.notes,
      },
    });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.subcontractors.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Subcontractor not found');
    }
  }
}
