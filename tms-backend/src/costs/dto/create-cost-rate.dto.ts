/**
 * C2-H: Swagger-annotated. DTO standalone (kein PartialType-Parent).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCostRateDto {
  @ApiProperty({ enum: ['PRE_CARRIAGE', 'MAIN_CARRIAGE', 'ON_CARRIAGE'] })
  @IsString()
  rateType!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  relationId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  subcontractorId?: string | null;

  @ApiProperty({ description: '€ pro 100 kg' })
  @IsNumber()
  ratePer100kg!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minCharge?: number;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
