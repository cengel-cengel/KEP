/**
 * C2-H: Swagger-annotated. DTO standalone (kein PartialType-Parent).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateRelationDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: ['OUTBOUND', 'INBOUND', 'BOTH'] })
  @IsString()
  direction!: string;

  @ApiPropertyOptional({ nullable: true, example: 'DE' })
  @IsOptional()
  @IsString()
  country_from?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'AT' })
  @IsOptional()
  @IsString()
  country_to?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  zip_prefix_from?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  zip_prefix_to?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  default_hall_location_id?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  network_partner_id?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'MON,WED,FRI' })
  @IsOptional()
  @IsString()
  departure_days?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '06:00' })
  @IsOptional()
  @IsString()
  departure_time?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  transit_days?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
