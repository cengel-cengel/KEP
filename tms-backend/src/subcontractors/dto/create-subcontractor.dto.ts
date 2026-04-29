import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSubcontractorDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  zip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  datevAccount?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;

  @IsOptional()
  @IsBoolean()
  hasAdrLicense?: boolean;

  @IsOptional()
  @IsBoolean()
  hasTemperature?: boolean;

  @IsOptional()
  @IsNumber()
  maxWeightKg?: number;

  @IsOptional()
  @IsNumber()
  maxLdm?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
