import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class ShipmentPricePreviewDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  loadingCountryCode!: string;

  @IsString()
  deliveryCountryCode!: string;

  @IsDateString()
  loadingDate!: string;

  @IsNumber()
  weightKg!: number;

  @IsOptional()
  @IsNumber()
  ldm?: number;

  @IsOptional()
  @IsNumber()
  packageCount?: number;
}
