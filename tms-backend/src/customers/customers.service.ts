import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateCustomerNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('customer_number_seq')
    `;
    const value = result[0].nextval.toString().padStart(5, '0');
    return `C${value}`;
  }

  async findAll(search?: string) {
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { customer_number: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.customers.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customers.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async create(dto: CreateCustomerDto, userId: string) {
    const customerNumber = await this.generateCustomerNumber();

    return this.prisma.customers.create({
      data: {
        customer_number: customerNumber,
        name: dto.name,
        name2: dto.name2,
        vat_id: dto.vatId,
        payment_term_days: dto.paymentTermDays,
        credit_limit: dto.creditLimit,
        datev_account: dto.datevAccount,
        default_incoterm: dto.defaultIncoterm,
        invoice_email: dto.invoiceEmail,
        edi_partner_id: dto.ediPartnerId,
        min_contribution_pct: dto.minContributionPct,
        notes: dto.notes,
        created_by: userId,
      },
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.ensureExists(id);

    return this.prisma.customers.update({
      where: { id },
      data: {
        name: dto.name,
        name2: dto.name2,
        vat_id: dto.vatId,
        payment_term_days: dto.paymentTermDays,
        credit_limit: dto.creditLimit,
        datev_account: dto.datevAccount,
        default_incoterm: dto.defaultIncoterm,
        invoice_email: dto.invoiceEmail,
        edi_partner_id: dto.ediPartnerId,
        min_contribution_pct: dto.minContributionPct,
        notes: dto.notes,
      },
    });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.customers.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Customer not found');
    }
  }
}
