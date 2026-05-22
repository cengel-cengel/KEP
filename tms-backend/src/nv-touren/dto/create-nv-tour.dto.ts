import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const NV_TOUR_STATUS = [
  'PLANNING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export class CreateNvTourDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  nv_stamm_tour_id!: string;

  @ApiProperty({ format: 'date', example: '2026-05-20' })
  @IsDateString()
  datum!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subunternehmer_id?: string | null;

  @ApiPropertyOptional({ maxLength: 20, example: 'Sprinter' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notizen?: string | null;

  @ApiPropertyOptional({ enum: NV_TOUR_STATUS })
  @IsOptional()
  @IsIn(NV_TOUR_STATUS as readonly string[])
  status?: string;

  // NV-4: Kosten-Felder bei Erstellung (FE CreateTourModal sendet sie;
  // Service mappt 1:1 auf nv_touren-Spalten Migration 26/27).
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  angefahrene_km?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stunden_geleistet?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fahrer_kosten_eur?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fahrzeug_kosten_eur?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  kraftstoff_kosten_eur?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dispo_kosten_eur?: number | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sonstige_kosten_eur?: number | null;
}
