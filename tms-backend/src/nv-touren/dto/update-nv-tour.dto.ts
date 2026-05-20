import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NV_TOUR_STATUS } from './create-nv-tour.dto';

export class UpdateNvTourDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  nv_stamm_tour_id?: string | null;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  datum?: string;

  @ApiPropertyOptional({ enum: NV_TOUR_STATUS })
  @IsOptional()
  @IsIn(NV_TOUR_STATUS as readonly string[])
  status?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subunternehmer_id?: string | null;

  @ApiPropertyOptional({ example: '07:30', description: 'HH:MM' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start_zeit?: string | null;

  @ApiPropertyOptional({ example: '18:00', description: 'HH:MM' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  end_zeit?: string | null;

  @ApiPropertyOptional({ maxLength: 20, example: 'Sprinter' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notizen?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fahrer_kosten_eur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  fahrzeug_kosten_eur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  kraftstoff_kosten_eur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dispo_kosten_eur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sonstige_kosten_eur?: number | null;

  @IsOptional()
  @IsIn(['TARIF', 'SPOT'])
  kosten_modus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  angefahrene_km?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stunden_geleistet?: number | null;
}
