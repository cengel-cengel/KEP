import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const TARIF_TYPEN = [
  'TAGESPAUSCHALE',
  'PRO_STOP',
  'KM_BASIERT',
  'STUNDEN_BASIERT',
  'SPOT',
] as const;

export class CreateNvSubunternehmerDto {
  @IsUUID()
  business_partner_id!: string;

  @IsOptional()
  @IsUUID()
  nv_tour_gebiet_id?: string | null;

  @IsOptional()
  @IsIn(TARIF_TYPEN as readonly string[])
  tarif_typ?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_pro_stop_eur?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_tagespauschale_eur?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_pro_km_eur?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_grundgebuehr_eur?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_pro_stunde_eur?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_paletten?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_gewicht_kg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_volumen_m3?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_ldm?: number;

  @IsOptional()
  @IsString()
  notiz?: string;

  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}
