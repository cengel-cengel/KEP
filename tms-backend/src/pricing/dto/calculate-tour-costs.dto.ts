import { IsBoolean, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CalculateTourCostsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  distanceKm?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  meeting?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  roundtrip?: boolean;
}
