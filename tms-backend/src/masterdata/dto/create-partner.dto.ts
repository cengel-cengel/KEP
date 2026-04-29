import {
  IsDateString,
  IsDecimal,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePartnerDto {
  @IsOptional()
  @IsString()
  partnerNumber?: string;

  @IsString()
  partnerType!: string;

  @IsOptional()
  @IsUUID()
  corporateGroupId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  name2?: string;

  @IsOptional()
  @IsString()
  legalForm?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  zip?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  vatId?: string;

  @IsOptional()
  @IsString()
  taxNumber?: string;

  @IsOptional()
  @IsString()
  commercialRegister?: string;

  @IsOptional()
  @IsString()
  commercialRegisterCourt?: string;

  @IsOptional()
  @IsString()
  datevAccount?: string;

  @IsOptional()
  @IsInt()
  paymentTermDays?: number;

  @IsOptional()
  @IsDecimal()
  skontoPercent?: number;

  @IsOptional()
  @IsInt()
  skontoDays?: number;

  @IsOptional()
  @IsDecimal()
  creditLimit?: number;

  @IsOptional()
  @IsString()
  creditLimitCurrency?: string;

  @IsOptional()
  @IsString()
  invoiceEmail?: string;

  @IsOptional()
  @IsString()
  invoiceDelivery?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsString()
  bic?: string;

  @IsOptional()
  @IsDecimal()
  minContributionPct?: number;

  // LKM-based cost calculation (Stapelmodell)
  @IsOptional()
  @IsDecimal()
  stackingFactor?: number;

  @IsOptional()
  @IsDecimal()
  avgWeightPerStellplatz?: number;

  @IsOptional()
  @IsDecimal()
  revenueTargetAnnual?: number;

  @IsOptional()
  @Type(() => Boolean)
  lksgRiskCountry?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  lksgSelfDisclosure?: boolean;

  @IsOptional()
  @IsDateString()
  lksgSelfDisclosureDate?: string;

  @IsOptional()
  @IsDateString()
  lksgNextReviewDate?: string;

  @IsOptional()
  @IsString()
  lksgNotes?: string;

  @IsOptional()
  @IsString()
  ediPartnerId?: string;

  @IsOptional()
  @IsString()
  ediFormat?: string;

  @IsOptional()
  @IsString()
  idsMemberNumber?: string;

  @IsOptional()
  @IsString()
  idsDepotCode?: string;

  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;
}
