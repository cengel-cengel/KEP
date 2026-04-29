import { IsBoolean, IsDateString, IsDecimal, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCostRateDto {
  @IsString()
  rateType!: string; // PRE_CARRIAGE | MAIN_CARRIAGE | ON_CARRIAGE

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  relationId?: string | null;

  @IsOptional()
  @IsString()
  subcontractorId?: string | null;

  @IsNumber()
  ratePer100kg!: number;

  @IsOptional()
  @IsNumber()
  minCharge?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

