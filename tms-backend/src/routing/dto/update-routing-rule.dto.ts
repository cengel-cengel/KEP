import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class UpdateRoutingRuleDto {
  @IsOptional()
  @IsString()
  rule_name?: string;

  @IsOptional()
  @IsIn(['INBOUND', 'OUTBOUND', 'BOTH'])
  direction?: string;

  @IsOptional()
  @IsUUID()
  partner_id?: string | null;

  @IsOptional()
  @IsString()
  country_code?: string;

  @IsOptional()
  @IsString()
  zip_from?: string | null;

  @IsOptional()
  @IsString()
  zip_to?: string | null;

  @IsOptional()
  @IsString()
  zip_prefix?: string | null;

  @IsOptional()
  @IsIn(['OWN_NV', 'NETWORK_PARTNER', 'CHARTER', 'COOPERATOR'])
  delivery_type?: string;

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
  departure_days?: string | null;

  @IsOptional()
  @IsString()
  departure_time?: string | null;

  @IsOptional()
  @IsString()
  cutoff_time?: string | null;

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

