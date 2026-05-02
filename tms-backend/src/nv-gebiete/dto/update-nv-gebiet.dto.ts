import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateNvGebietDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['BALLUNGSRAUM', 'STANDARD', 'LAENDLICH'])
  gebiet_typ?: string;

  @IsOptional()
  @IsArray()
  plz_ranges?: string[];

  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}
