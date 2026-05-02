import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateNvTourGebietDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsArray()
  plz_pattern?: string[];

  @IsOptional()
  @IsString()
  @IsHexColor()
  farbe?: string;

  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}
