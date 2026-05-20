import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const NV_TOUR_STATUS = [
  'PLANNING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export class CreateNvTourDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  nv_stamm_tour_id!: string;

  @ApiProperty({ format: 'date', example: '2026-05-20' })
  @IsDateString()
  datum!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subunternehmer_id?: string | null;

  @ApiPropertyOptional({ maxLength: 20, example: 'Sprinter' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notizen?: string | null;

  @ApiPropertyOptional({ enum: NV_TOUR_STATUS })
  @IsOptional()
  @IsIn(NV_TOUR_STATUS as readonly string[])
  status?: string;
}
