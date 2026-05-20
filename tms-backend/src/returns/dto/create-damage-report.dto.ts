import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const DAMAGE_TYPES = ['OPTISCH', 'VERDECKT', 'TOTALSCHADEN'] as const;
const DAMAGE_CAUSES = ['VERPACKUNG', 'TRANSPORT', 'PARTNER', 'UNBEKANNT'] as const;

export class CreateDamageReportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;

  @ApiProperty({ enum: DAMAGE_TYPES })
  @IsIn(DAMAGE_TYPES as readonly string[])
  damageType!: string;

  @ApiPropertyOptional({ enum: DAMAGE_CAUSES })
  @IsOptional()
  @IsIn(DAMAGE_CAUSES as readonly string[])
  damageCause?: string;

  @ApiProperty()
  @IsString()
  damageDescription!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoBase64_1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoBase64_2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoBase64_3?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  damageValueEur?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  liabilityParty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  insuranceClaim?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  insuranceRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reportedByDriver?: boolean;
}
