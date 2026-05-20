import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  nv_stamm_tour_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customer_id!: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Standard-Position in Tour' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standard_position?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Standard-Servicezeit in Min.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standard_servicezeit_min?: number;

  @ApiPropertyOptional({ enum: ROUTING_KLASSEN })
  @IsOptional()
  @IsString()
  @IsIn(ROUTING_KLASSEN as readonly string[])
  routing_klasse?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notizen?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}
