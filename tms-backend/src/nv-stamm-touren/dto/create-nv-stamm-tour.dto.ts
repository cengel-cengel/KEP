import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const WOCHENTAGE = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'] as const;

export class CreateNvStammTourDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsUUID()
  nv_tour_gebiet_id!: string;

  @IsOptional()
  @IsUUID()
  default_subunternehmer_id?: string | null;

  @IsArray()
  @ArrayUnique()
  @IsIn(WOCHENTAGE as readonly string[], { each: true })
  wochentage!: string[];

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start_zeit?: string | null; // HH:mm

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string | null;

  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}
