import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class DailyPricePreviewDto {
  @IsString()
  originCountry!: string;

  @IsString()
  destCountry!: string;

  @Type(() => Number)
  @IsNumber()
  ldm!: number;

  @Type(() => Number)
  @IsNumber()
  weightKg!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stopCount?: number;

  @IsOptional()
  @IsUUID()
  relationId?: string | null;
}
