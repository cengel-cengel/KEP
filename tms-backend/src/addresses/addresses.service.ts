import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCustomer(customerId?: string) {
    if (!customerId) {
      throw new BadRequestException('customerId is required');
    }

    return this.prisma.addresses.findMany({
      where: { customer_id: customerId },
      orderBy: [{ name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const address = await this.prisma.addresses.findUnique({
      where: { id },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  async create(dto: CreateAddressDto) {
    return this.prisma.addresses.create({
      data: {
        customer_id: dto.customerId ?? null,
        type: dto.type,
        name: dto.name,
        name2: dto.name2,
        street: dto.street,
        zip: dto.zip,
        city: dto.city,
        country_code: dto.countryCode ?? 'DE',
        contact_name: dto.contactName,
        contact_phone: dto.contactPhone,
        contact_email: dto.contactEmail,
        notes: dto.notes,
        lat: dto.lat != null ? dto.lat : undefined,
        lng: dto.lng != null ? dto.lng : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateAddressDto) {
    await this.ensureExists(id);

    return this.prisma.addresses.update({
      where: { id },
      data: {
        customer_id: dto.customerId,
        type: dto.type,
        name: dto.name,
        name2: dto.name2,
        street: dto.street,
        zip: dto.zip,
        city: dto.city,
        country_code: dto.countryCode,
        contact_name: dto.contactName,
        contact_phone: dto.contactPhone,
        contact_email: dto.contactEmail,
        notes: dto.notes,
        lat: dto.lat !== undefined ? dto.lat : undefined,
        lng: dto.lng !== undefined ? dto.lng : undefined,
      },
    });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.addresses.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Address not found');
    }
  }
}
