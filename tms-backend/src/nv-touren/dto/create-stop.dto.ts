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
  @IsUUID()
  shipment_id!: string;

  @IsOptional()
  @IsIn(STOP_TYPES as readonly string[])
  stop_type?: 'PICKUP' | 'DELIVERY';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  servicezeit_min?: number;

  @IsOptional()
  @IsString()
  @IsIn(ROUTING_KLASSEN as readonly string[])
  routing_klasse?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  service_zuschlaege?: string[];
}

export class UpdateNvTourStopDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsIn(STOP_TYPES as readonly string[])
  stop_type?: 'PICKUP' | 'DELIVERY';

  @IsOptional()
  @IsIn(STOP_STATUS as readonly string[])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  servicezeit_min?: number | null;

  @IsOptional()
  @IsString()
  @IsIn(ROUTING_KLASSEN as readonly string[])
  routing_klasse?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  service_zuschlaege?: string[];

  @IsOptional()
  @IsDateString()
  ankunft_zeit?: string | null;

  @IsOptional()
  @IsDateString()
  abfahrt_zeit?: string | null;

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
