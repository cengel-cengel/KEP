import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { CreatePartnerLocationDto } from './dto/create-partner-location.dto';
import { UpdatePartnerLocationDto } from './dto/update-partner-location.dto';
import { CreatePartnerContactDto } from './dto/create-partner-contact.dto';

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  async getCorporateGroups() {
    return this.prisma.corporate_groups.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    });
  }

  async createPartner(dto: CreatePartnerDto) {
    const partnerNumber =
      dto.partnerNumber ?? `BP-${Date.now().toString().slice(-8)}`;
    return this.prisma.business_partners.create({
      data: {
        partner_number: partnerNumber,
        partner_type: dto.partnerType,
        corporate_group_id: dto.corporateGroupId ?? undefined,

        name: dto.name,
        name2: dto.name2 ?? undefined,
        legal_form: dto.legalForm ?? undefined,

        street: dto.street ?? undefined,
        zip: dto.zip ?? undefined,
        city: dto.city ?? undefined,
        country_code: dto.countryCode ?? undefined,

        vat_id: dto.vatId ?? undefined,
        tax_number: dto.taxNumber ?? undefined,
        commercial_register: dto.commercialRegister ?? undefined,
        commercial_register_court: dto.commercialRegisterCourt ?? undefined,

        datev_account: dto.datevAccount ?? undefined,
        payment_term_days: dto.paymentTermDays ?? undefined,
        skonto_percent: dto.skontoPercent ?? undefined,
        skonto_days: dto.skontoDays ?? undefined,
        credit_limit: dto.creditLimit ?? undefined,
        credit_limit_currency: dto.creditLimitCurrency ?? undefined,
        invoice_email: dto.invoiceEmail ?? undefined,
        invoice_delivery: dto.invoiceDelivery ?? undefined,

        bank_name: dto.bankName ?? undefined,
        iban: dto.iban ?? undefined,
        bic: dto.bic ?? undefined,

        min_contribution_pct: dto.minContributionPct ?? undefined,
        stacking_factor: dto.stackingFactor ?? undefined,
        avg_weight_per_stellplatz: dto.avgWeightPerStellplatz ?? undefined,
        revenue_target_annual: dto.revenueTargetAnnual ?? undefined,

        lksg_risk_country: dto.lksgRiskCountry ?? undefined,
        lksg_self_disclosure: dto.lksgSelfDisclosure ?? undefined,
        lksg_self_disclosure_date: dto.lksgSelfDisclosureDate
          ? new Date(dto.lksgSelfDisclosureDate)
          : undefined,
        lksg_next_review_date: dto.lksgNextReviewDate
          ? new Date(dto.lksgNextReviewDate)
          : undefined,
        lksg_notes: dto.lksgNotes ?? undefined,

        edi_partner_id: dto.ediPartnerId ?? undefined,
        edi_format: dto.ediFormat ?? undefined,
        ids_member_number: dto.idsMemberNumber ?? undefined,
        ids_depot_code: dto.idsDepotCode ?? undefined,

        is_active: dto.isActive ?? undefined,
      },
    });
  }

  async updatePartner(id: string, dto: UpdatePartnerDto) {
    const exists = await this.prisma.business_partners.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Partner ${id} nicht gefunden`);

    return this.prisma.$transaction(async (tx) => {
      const updatedPartner = await tx.business_partners.update({
        where: { id },
        data: {
          partner_number: dto.partnerNumber ?? undefined,
          partner_type: dto.partnerType ?? undefined,
          corporate_group_id: dto.corporateGroupId ?? undefined,

          name: dto.name ?? undefined,
          name2: dto.name2 ?? undefined,
          legal_form: dto.legalForm ?? undefined,

          street: dto.street ?? undefined,
          zip: dto.zip ?? undefined,
          city: dto.city ?? undefined,
          country_code: dto.countryCode ?? undefined,

          vat_id: dto.vatId ?? undefined,
          tax_number: dto.taxNumber ?? undefined,
          commercial_register: dto.commercialRegister ?? undefined,
          commercial_register_court: dto.commercialRegisterCourt ?? undefined,

          datev_account: dto.datevAccount ?? undefined,
          payment_term_days: dto.paymentTermDays ?? undefined,
          skonto_percent: dto.skontoPercent ?? undefined,
          skonto_days: dto.skontoDays ?? undefined,
          credit_limit: dto.creditLimit ?? undefined,
          credit_limit_currency: dto.creditLimitCurrency ?? undefined,
          invoice_email: dto.invoiceEmail ?? undefined,
          invoice_delivery: dto.invoiceDelivery ?? undefined,

          bank_name: dto.bankName ?? undefined,
          iban: dto.iban ?? undefined,
          bic: dto.bic ?? undefined,

          min_contribution_pct: dto.minContributionPct ?? undefined,
          stacking_factor: dto.stackingFactor ?? undefined,
          avg_weight_per_stellplatz: dto.avgWeightPerStellplatz ?? undefined,
          revenue_target_annual: dto.revenueTargetAnnual ?? undefined,

          lksg_risk_country: dto.lksgRiskCountry ?? undefined,
          lksg_self_disclosure: dto.lksgSelfDisclosure ?? undefined,
          lksg_self_disclosure_date: dto.lksgSelfDisclosureDate
            ? new Date(dto.lksgSelfDisclosureDate)
            : undefined,
          lksg_next_review_date: dto.lksgNextReviewDate
            ? new Date(dto.lksgNextReviewDate)
            : undefined,
          lksg_notes: dto.lksgNotes ?? undefined,

          edi_partner_id: dto.ediPartnerId ?? undefined,
          edi_format: dto.ediFormat ?? undefined,
          ids_member_number: dto.idsMemberNumber ?? undefined,
          ids_depot_code: dto.idsDepotCode ?? undefined,
        },
      });

      if (dto.contacts?.length) {
        for (const c of dto.contacts) {
          const res = await tx.partner_contacts.updateMany({
            where: { id: c.id, partner_id: id },
            data: {
              contact_type: c.contactType,
              name: c.name,
              title: c.title ?? undefined,
              phone: c.phone ?? undefined,
              mobile: c.mobile ?? undefined,
              email: c.email ?? undefined,
              notes: c.notes ?? undefined,
              is_primary: c.isPrimary ?? undefined,
            },
          });
          if (res.count === 0) {
            throw new NotFoundException(
              `Kontakt ${c.id} für Partner ${id} nicht gefunden`,
            );
          }
        }
      }

      return updatedPartner;
    });
  }

  async findAllPartners(type?: string, search?: string) {
    const where: any = {};
    if (type) where.partner_type = type;
    if (search?.trim()) {
      const s = search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { partner_number: { contains: s, mode: 'insensitive' } },
        { vat_id: { contains: s, mode: 'insensitive' } },
        { iban: { contains: s, mode: 'insensitive' } },
        { bic: { contains: s, mode: 'insensitive' } },
        { bank_name: { contains: s, mode: 'insensitive' } },
        { city: { contains: s, mode: 'insensitive' } },
        {
          locations: {
            some: {
              OR: [
                { name: { contains: s, mode: 'insensitive' } },
                { city: { contains: s, mode: 'insensitive' } },
                { zip: { contains: s, mode: 'insensitive' } },
                { location_key: { contains: s, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    return this.prisma.business_partners.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  async findPartnerById(id: string) {
    const partner = await this.prisma.business_partners.findUnique({
      where: { id },
      include: {
        corporate_group: true,
        contacts: true,
        locations: true,
      },
    });

    if (!partner) throw new NotFoundException(`Partner ${id} nicht gefunden`);
    return partner;
  }

  async getLocations(partnerId: string) {
    return this.prisma.partner_locations.findMany({
      where: { partner_id: partnerId },
      orderBy: { created_at: 'desc' },
    });
  }

  private parseOpeningTime(s?: string): Date | undefined {
    if (!s?.trim()) return undefined;
    return new Date(`1970-01-01T${s.trim()}:00`);
  }

  async createLocation(partnerId: string, dto: CreatePartnerLocationDto) {
    const wFrom = this.parseOpeningTime(dto.openingWeekFrom);
    const wTo = this.parseOpeningTime(dto.openingWeekTo);

    const monFrom = this.parseOpeningTime(dto.openingMonFrom) ?? wFrom;
    const monTo = this.parseOpeningTime(dto.openingMonTo) ?? wTo;
    const tueFrom = this.parseOpeningTime(dto.openingTueFrom) ?? wFrom;
    const tueTo = this.parseOpeningTime(dto.openingTueTo) ?? wTo;
    const wedFrom = this.parseOpeningTime(dto.openingWedFrom) ?? wFrom;
    const wedTo = this.parseOpeningTime(dto.openingWedTo) ?? wTo;
    const thuFrom = this.parseOpeningTime(dto.openingThuFrom) ?? wFrom;
    const thuTo = this.parseOpeningTime(dto.openingThuTo) ?? wTo;
    const friFrom = this.parseOpeningTime(dto.openingFriFrom) ?? wFrom;
    const friTo = this.parseOpeningTime(dto.openingFriTo) ?? wTo;
    const satFrom = this.parseOpeningTime(dto.openingSatFrom);
    const satTo = this.parseOpeningTime(dto.openingSatTo);

    return this.prisma.partner_locations.create({
      data: {
        partner_id: partnerId,
        location_key: dto.locationKey,
        location_type: dto.locationType ?? undefined,
        name: dto.name,
        name2: dto.name2 ?? undefined,
        street: dto.street,
        zip: dto.zip,
        city: dto.city,
        country_code: dto.countryCode ?? undefined,
        lat: dto.lat ?? undefined,
        lng: dto.lng ?? undefined,

        opening_mon_from: monFrom,
        opening_mon_to: monTo,
        opening_tue_from: tueFrom,
        opening_tue_to: tueTo,
        opening_wed_from: wedFrom,
        opening_wed_to: wedTo,
        opening_thu_from: thuFrom,
        opening_thu_to: thuTo,
        opening_fri_from: friFrom,
        opening_fri_to: friTo,
        opening_sat_from: satFrom,
        opening_sat_to: satTo,
        has_loading_ramp: dto.hasLoadingRamp ?? undefined,
        ramp_count: dto.rampCount ?? undefined,
        max_vehicle_length_m: dto.maxVehicleLengthM ?? undefined,
        forklift_available: dto.forkliftAvailable ?? undefined,
        appointment_required: dto.appointmentRequired ?? undefined,
        access_code: dto.accessCode ?? undefined,
        special_instructions: dto.specialInstructions ?? undefined,
        contact_name: dto.contactName ?? undefined,
        contact_phone: dto.contactPhone ?? undefined,
        contact_email: dto.contactEmail ?? undefined,
      },
    });
  }

  async updateLocation(
    partnerId: string,
    locationId: string,
    dto: UpdatePartnerLocationDto,
  ) {
    const exists = await this.prisma.partner_locations.findFirst({
      where: { id: locationId, partner_id: partnerId },
      select: { id: true },
    });
    if (!exists)
      throw new NotFoundException(
        `Location ${locationId} für Partner ${partnerId} nicht gefunden`,
      );

    const wFrom = this.parseOpeningTime(dto.openingWeekFrom);
    const wTo = this.parseOpeningTime(dto.openingWeekTo);

    const monFrom = this.parseOpeningTime(dto.openingMonFrom) ?? wFrom;
    const monTo = this.parseOpeningTime(dto.openingMonTo) ?? wTo;
    const tueFrom = this.parseOpeningTime(dto.openingTueFrom) ?? wFrom;
    const tueTo = this.parseOpeningTime(dto.openingTueTo) ?? wTo;
    const wedFrom = this.parseOpeningTime(dto.openingWedFrom) ?? wFrom;
    const wedTo = this.parseOpeningTime(dto.openingWedTo) ?? wTo;
    const thuFrom = this.parseOpeningTime(dto.openingThuFrom) ?? wFrom;
    const thuTo = this.parseOpeningTime(dto.openingThuTo) ?? wTo;
    const friFrom = this.parseOpeningTime(dto.openingFriFrom) ?? wFrom;
    const friTo = this.parseOpeningTime(dto.openingFriTo) ?? wTo;

    const satFrom = this.parseOpeningTime(dto.openingSatFrom) ?? undefined;
    const satTo = this.parseOpeningTime(dto.openingSatTo) ?? undefined;

    return this.prisma.partner_locations.update({
      where: { id: locationId },
      data: {
        location_key: dto.locationKey ?? undefined,
        location_type: dto.locationType ?? undefined,
        name: dto.name ?? undefined,
        name2: dto.name2 ?? undefined,
        street: dto.street ?? undefined,
        zip: dto.zip ?? undefined,
        city: dto.city ?? undefined,
        country_code: dto.countryCode ?? undefined,
        lat: dto.lat ?? undefined,
        lng: dto.lng ?? undefined,

        opening_mon_from: monFrom ?? undefined,
        opening_mon_to: monTo ?? undefined,
        opening_tue_from: tueFrom ?? undefined,
        opening_tue_to: tueTo ?? undefined,
        opening_wed_from: wedFrom ?? undefined,
        opening_wed_to: wedTo ?? undefined,
        opening_thu_from: thuFrom ?? undefined,
        opening_thu_to: thuTo ?? undefined,
        opening_fri_from: friFrom ?? undefined,
        opening_fri_to: friTo ?? undefined,
        opening_sat_from: satFrom ?? undefined,
        opening_sat_to: satTo ?? undefined,

        has_loading_ramp: dto.hasLoadingRamp ?? undefined,
        ramp_count: dto.rampCount ?? undefined,
        max_vehicle_length_m: dto.maxVehicleLengthM ?? undefined,
        forklift_available: dto.forkliftAvailable ?? undefined,
        appointment_required: dto.appointmentRequired ?? undefined,
        access_code: dto.accessCode ?? undefined,
        special_instructions: dto.specialInstructions ?? undefined,
        contact_name: dto.contactName ?? undefined,
        contact_phone: dto.contactPhone ?? undefined,
        contact_email: dto.contactEmail ?? undefined,
      },
    });
  }

  async deleteLocation(partnerId: string, locationId: string) {
    const exists = await this.prisma.partner_locations.findFirst({
      where: { id: locationId, partner_id: partnerId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(
        `Location ${locationId} für Partner ${partnerId} nicht gefunden`,
      );
    }
    return this.prisma.partner_locations.delete({
      where: { id: locationId },
    });
  }

  async findLocationByKey(key: string) {
    return this.prisma.partner_locations.findFirst({
      where: { location_key: key },
      include: {
        partner: {
          select: {
            id: true,
            partner_number: true,
            name: true,
            partner_type: true,
          },
        },
      },
    });
  }

  async getContacts(partnerId: string) {
    return this.prisma.partner_contacts.findMany({
      where: { partner_id: partnerId },
      orderBy: { is_primary: 'desc' },
    });
  }

  async createContact(partnerId: string, dto: CreatePartnerContactDto) {
    return this.prisma.partner_contacts.create({
      data: {
        partner_id: partnerId,
        contact_type: dto.contactType,
        name: dto.name,
        title: dto.title ?? undefined,
        phone: dto.phone ?? undefined,
        mobile: dto.mobile ?? undefined,
        email: dto.email ?? undefined,
        notes: dto.notes ?? undefined,
        is_primary: dto.isPrimary ?? undefined,
      },
    });
  }
}
