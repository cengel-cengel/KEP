import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePricingRuleDto {
  @IsString()
  ruleType!: string;

  @IsString()
  ruleName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  partnerId?: string | null;

  @IsOptional()
  @IsUUID()
  subcontractorId?: string | null;

  @IsOptional()
  @IsUUID()
  relationId?: string | null;

  @IsString()
  originCountry!: string;

  @IsOptional()
  @IsString()
  originZipPrefix?: string | null;

  @IsString()
  destCountry!: string;

  @IsOptional()
  @IsString()
  destZipPrefix?: string | null;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsString()
  rateBasis?: string;

  @IsNumber()
  rate!: number;

  @IsOptional()
  @IsNumber()
  minCharge?: number;

  @IsNumber()
  maxCharge!: number;

  @IsOptional()
  @IsString()
  zonesJson?: string | null;

  @IsOptional()
  @IsString()
  tiersJson?: string | null;

  @IsOptional()
  @IsNumber()
  fuelSurchargePct?: number;

  @IsOptional()
  @IsNumber()
  adrSurcharge?: number;

  @IsOptional()
  @IsNumber()
  timeslotSurcharge?: number;

  @IsOptional()
  @IsNumber()
  b2cSurcharge?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validTo?: string | null;
}

