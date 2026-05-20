import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CalculateTourCostsDto {
  @ApiPropertyOptional({ example: 250, description: 'Tour-Distanz in km' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  distanceKm?: number;

  @ApiPropertyOptional({ description: 'Sub-Treffen am Hub (Tarif-Modifier)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  meeting?: boolean;

  @ApiPropertyOptional({ description: 'Round-Trip-Faktor' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  roundtrip?: boolean;
}
