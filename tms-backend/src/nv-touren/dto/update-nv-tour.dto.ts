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
  @IsOptional()
  @IsUUID()
  nv_stamm_tour_id?: string | null;

  @IsOptional()
  @IsDateString()
  datum?: string;

  @IsOptional()
  @IsIn(NV_TOUR_STATUS as readonly string[])
  status?: string;

  @IsOptional()
  @IsUUID()
  subunternehmer_id?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start_zeit?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  end_zeit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string | null;

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
