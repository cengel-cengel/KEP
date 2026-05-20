import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const STOP_STATUS = [
  'PLANNED',
  'EN_ROUTE',
  'ARRIVED',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
] as const;
export const STOP_TYPES = ['PICKUP', 'DELIVERY'] as const;
export const ROUTING_KLASSEN = [
  'STAMMROUTE',
  'KLEINER_SCHLENKER',
  'MITTLERER_UMWEG',
  'SEPARATER_TOURAST',
] as const;

export class CreateNvTourStopDto {
  @ApiProperty({ format: 'uuid', description: 'Shipment-ID' })
  @IsUUID()
  shipment_id!: string;

  @ApiPropertyOptional({ enum: STOP_TYPES })
  @IsOptional()
  @IsIn(STOP_TYPES as readonly string[])
  stop_type?: 'PICKUP' | 'DELIVERY';

  @ApiPropertyOptional({ minimum: 0, description: 'Stop-Position in Tour' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Servicezeit in Minuten' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  servicezeit_min?: number;

  @ApiPropertyOptional({ enum: ROUTING_KLASSEN })
  @IsOptional()
  @IsString()
  @IsIn(ROUTING_KLASSEN as readonly string[])
  routing_klasse?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  service_zuschlaege?: string[];
}

export class UpdateNvTourStopDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ enum: STOP_TYPES })
  @IsOptional()
  @IsIn(STOP_TYPES as readonly string[])
  stop_type?: 'PICKUP' | 'DELIVERY';

  @ApiPropertyOptional({
    enum: STOP_STATUS,
    description: 'Driver-Progress (Sprint C: PLANNED→EN_ROUTE→ARRIVED→COMPLETED)',
  })
  @IsOptional()
  @IsIn(STOP_STATUS as readonly string[])
  status?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  servicezeit_min?: number | null;

  @ApiPropertyOptional({ enum: ROUTING_KLASSEN })
  @IsOptional()
  @IsString()
  @IsIn(ROUTING_KLASSEN as readonly string[])
  routing_klasse?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  service_zuschlaege?: string[];

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  ankunft_zeit?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  abfahrt_zeit?: string | null;

  @ApiPropertyOptional({ description: 'Freitext-Notiz für Stop (Sprint C)' })
  @IsOptional()
  @IsString()
  notizen?: string | null;
}

export class ReorderItemDto {
  @IsUUID()
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  position!: number;
}

export class ReorderNvTourStopsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}
