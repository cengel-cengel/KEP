import { IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateDailyPriceConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  base_margin_pct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  market_delta_factor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  manual_surcharge_pct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  timocom_weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dat_weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  internal_weight?: number;
}
