import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'HH-Nord OUTBOUND' })
  @IsString()
  rule_name!: string;

  @ApiProperty({ enum: ['INBOUND', 'OUTBOUND', 'BOTH'] })
  @IsIn(['INBOUND', 'OUTBOUND', 'BOTH'])
  direction!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsString()
  @IsOptional()
  @IsUUID()
  partner_id?: string | null;

  @ApiProperty({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsString()
  country_code!: string;

  @ApiPropertyOptional({ example: '20000' })
  @IsOptional()
  @IsString()
  zip_from?: string | null;

  @ApiPropertyOptional({ example: '29999' })
  @IsOptional()
  @IsString()
  zip_to?: string | null;

  @ApiPropertyOptional({ example: '2' })
  @IsOptional()
  @IsString()
  zip_prefix?: string | null;

  @ApiProperty({
    enum: ['OWN_NV', 'NETWORK_PARTNER', 'CHARTER', 'COOPERATOR'],
  })
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

