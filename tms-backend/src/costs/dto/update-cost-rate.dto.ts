import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateCostRateDto {
  @IsOptional()
  @IsString()
  rateType?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  relationId?: string | null;

  @IsOptional()
  @IsString()
  subcontractorId?: string | null;

  @IsOptional()
  @IsNumber()
  ratePer100kg?: number;

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

