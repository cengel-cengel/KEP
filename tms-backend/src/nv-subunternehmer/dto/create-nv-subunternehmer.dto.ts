import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateNvSubunternehmerDto {
  @IsUUID()
  business_partner_id!: string;

  @IsOptional()
  @IsUUID()
  nv_tour_gebiet_id?: string | null;

  @IsOptional()
  @IsIn(['PRO_STOP', 'TAGESPAUSCHALE', 'SPOT'])
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
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string;

  @IsOptional()
  @IsString()
  notiz?: string;

  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}
