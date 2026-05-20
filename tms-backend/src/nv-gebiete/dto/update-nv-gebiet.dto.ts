import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const GEBIET_TYPEN = ['BALLUNGSRAUM', 'STANDARD', 'LAENDLICH'] as const;

export class UpdateNvGebietDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: GEBIET_TYPEN })
  @IsOptional()
  @IsString()
  @IsIn(GEBIET_TYPEN as readonly string[])
  gebiet_typ?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'PLZ-Ranges (z.B. ["20000-29999"])',
  })
  @IsOptional()
  @IsArray()
  plz_ranges?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}
