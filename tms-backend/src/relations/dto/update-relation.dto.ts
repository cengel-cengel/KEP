import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateRelationDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  direction?: string; // INBOUND, OUTBOUND, BOTH

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
  departure_days?: string | null;

  @IsOptional()
  @IsString()
  departure_time?: string | null; // HH:mm

  @IsOptional()
  @IsInt()
  transit_days?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_active?: boolean;
}
