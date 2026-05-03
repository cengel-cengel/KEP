import {
  IsArray,
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
import { TARIF_TYPEN } from './create-nv-subunternehmer.dto';

export class UpdateNvSubunternehmerDto {
  @IsOptional()
  @IsUUID()
  business_partner_id?: string;

  @IsOptional()
  @IsUUID()
  nv_tour_gebiet_id?: string | null;

  @IsOptional()
  @IsIn(TARIF_TYPEN as readonly string[])
  tarif_typ?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_pro_stop_eur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_tagespauschale_eur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_pro_km_eur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_grundgebuehr_eur?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tarif_pro_stunde_eur?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_paletten?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_gewicht_kg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_volumen_m3?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_ldm?: number | null;

  @IsOptional()
  @IsString()
  notiz?: string | null;

  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}

export class BulkAktivDto {
  @IsArray()
  @IsUUID('all', { each: true })
  ids!: string[];

  @IsBoolean()
  aktiv!: boolean;
}
