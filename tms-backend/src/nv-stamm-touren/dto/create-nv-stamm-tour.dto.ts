import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ maxLength: 40, example: 'HH-NORD-01' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiProperty({ maxLength: 120, example: 'Hamburg Nord Mo-Fr' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  nv_tour_gebiet_id!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  default_subunternehmer_id?: string | null;

  @ApiProperty({
    type: [String],
    enum: WOCHENTAGE,
    example: ['MO', 'DI', 'MI', 'DO', 'FR'],
    description: '2-letter codes',
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(WOCHENTAGE as readonly string[], { each: true })
  wochentage!: string[];

  @ApiPropertyOptional({ example: '07:30', description: 'HH:mm' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start_zeit?: string | null;

  @ApiPropertyOptional({ maxLength: 20, example: 'Sprinter' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}
