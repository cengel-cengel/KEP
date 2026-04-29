import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class ShipmentPricingPreviewDto {
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  businessPartnerId?: string | null;

  @IsString()
  originZip!: string;

  @IsString()
  originCountry!: string;

  @IsString()
  destZip!: string;

  @IsString()
  destCountry!: string;

  @Type(() => Number)
  @IsNumber()
  ldm!: number;

  @Type(() => Number)
  @IsNumber()
  weightKg!: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isHazmat?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stopCount?: number;
}
