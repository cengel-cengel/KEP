import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const ROUTING_KLASSEN = [
  'STAMMROUTE',
  'KLEINER_SCHLENKER',
  'MITTLERER_UMWEG',
  'SEPARATER_TOURAST',
] as const;

export class CreateNvStammKundeDto {
  @IsUUID()
  nv_stamm_tour_id!: string;

  @IsUUID()
  customer_id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standard_position?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standard_servicezeit_min?: number;

  @IsOptional()
  @IsString()
  @IsIn(ROUTING_KLASSEN as readonly string[])
  routing_klasse?: string | null;

  @IsOptional()
  @IsString()
  notizen?: string | null;

  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}
