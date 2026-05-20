import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ example: 'P-12345' })
  @IsOptional()
  @IsString()
  partnerNumber?: string;

  @ApiProperty({
    example: 'CUSTOMER',
    description: 'CUSTOMER | SUPPLIER | CARRIER | …',
  })
  @IsString()
  partnerType!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  corporateGroupId?: string;

  @ApiProperty({ example: 'Müller GmbH' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  legalForm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({ example: '20095' })
  @IsOptional()
  @IsString()
  zip?: string;

  @ApiPropertyOptional({ example: 'Hamburg' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ example: 'DE123456789' })
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
