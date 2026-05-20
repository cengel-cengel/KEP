import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePricingRuleDto {
  @ApiProperty({ example: 'CUSTOMER_TARIFF', description: 'CUSTOMER_TARIFF | CARRIER_RATE | …' })
  @IsString()
  ruleType!: string;

  @ApiProperty({ example: 'DE-DE Standard 2026' })
  @IsString()
  ruleName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  partnerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subcontractorId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  relationId?: string | null;

  @ApiProperty({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsString()
  originCountry!: string;

  @ApiPropertyOptional({ example: '2', description: 'PLZ-Prefix (z.B. "2" für 2xxxx)' })
  @IsOptional()
  @IsString()
  originZipPrefix?: string | null;

  @ApiProperty({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsString()
  destCountry!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  destZipPrefix?: string | null;

  @ApiPropertyOptional({ description: 'Höhere Priority gewinnt bei Match-Mehrdeutigkeit' })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({ example: 'weight', enum: ['weight', 'ldm', 'flat'] })
  @IsOptional()
  @IsString()
  rateBasis?: string;

  @ApiProperty({ example: 1.85 })
  @IsNumber()
  rate!: number;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsNumber()
  minCharge?: number;

  @ApiProperty({ example: 10000 })
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

