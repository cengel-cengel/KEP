import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateRoutingRuleDto {
  @IsString()
  rule_name!: string;

  @IsIn(['INBOUND', 'OUTBOUND', 'BOTH'])
  direction!: string;

  @IsString()
  @IsOptional()
  @IsUUID()
  partner_id?: string | null;

  @IsString()
  country_code!: string;

  @IsOptional()
  @IsString()
  zip_from?: string | null;

  @IsOptional()
  @IsString()
  zip_to?: string | null;

  @IsOptional()
  @IsString()
  zip_prefix?: string | null;

  @IsIn(['OWN_NV', 'NETWORK_PARTNER', 'CHARTER', 'COOPERATOR'])
  delivery_type!: string;

  @IsOptional()
  @IsString()
  partner_name?: string | null;

  @IsOptional()
  @IsString()
  gateway_name?: string | null;

  @IsOptional()
  @IsString()
  gateway_zip?: string | null;

  @IsOptional()
  @IsString()
  gateway_city?: string | null;

  @IsOptional()
  @IsString()
  gateway_country?: string | null;

  @IsOptional()
  @IsInt()
  transit_days?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  departure_days?: string | null; // "MON,TUE,WED,THU,FRI"

  @IsOptional()
  @IsString()
  departure_time?: string | null; // "HH:mm"

  @IsOptional()
  @IsString()
  cutoff_time?: string | null; // "HH:mm"

  @IsOptional()
  @IsUUID()
  hall_location_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsDateString()
  valid_from?: string | null;

  @IsOptional()
  @IsDateString()
  valid_to?: string | null;
}

