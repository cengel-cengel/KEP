import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRelationDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsString()
  direction!: string; // OUTBOUND, INBOUND, BOTH

  @IsOptional()
  @IsString()
  country_from?: string | null;

  @IsOptional()
  @IsString()
  country_to?: string | null;

  @IsOptional()
  @IsString()
  zip_prefix_from?: string | null;

  @IsOptional()
  @IsString()
  zip_prefix_to?: string | null;

  @IsOptional()
  @IsUUID()
  default_hall_location_id?: string | null;

  @IsOptional()
  @IsUUID()
  network_partner_id?: string | null;

  @IsOptional()
  @IsString()
  departure_days?: string | null; // "MON,WED,FRI"

  @IsOptional()
  @IsString()
  departure_time?: string | null; // "HH:mm"

  @IsOptional()
  @IsInt()
  transit_days?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
