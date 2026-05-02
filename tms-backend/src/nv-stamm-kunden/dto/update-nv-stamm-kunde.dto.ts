import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const ROUTING_KLASSEN = [
  'STAMMROUTE',
  'KLEINER_SCHLENKER',
  'MITTLERER_UMWEG',
  'SEPARATER_TOURAST',
] as const;

export class UpdateNvStammKundeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standard_position?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standard_servicezeit_min?: number | null;

  @IsOptional()
  @IsString()
  @IsIn(ROUTING_KLASSEN as readonly string[])
  routing_klasse?: string | null;

  @IsOptional()
  @IsString()
  notizen?: string | null;

  @IsOptional()
  @IsBoolean()
  aktiv?: boolean;
}

export class ReorderItemDto {
  @IsUUID()
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  standard_position!: number;
}

export class ReorderNvStammKundenDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}
