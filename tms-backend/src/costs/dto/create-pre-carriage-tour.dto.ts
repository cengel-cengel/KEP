/**
 * C2-H: Swagger-annotated. DTO standalone (kein PartialType-Parent).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePreCarriageTourDto {
  @ApiProperty({ format: 'date', example: '2026-05-21' })
  @IsDateString()
  tourDate!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  subcontractorId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  totalCost?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  costRateId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  distanceKm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
