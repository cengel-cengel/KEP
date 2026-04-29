import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class ConditionPricePreviewDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsNumber()
  weightKg!: number;

  @IsOptional()
  @IsNumber()
  ldm?: number;

  @IsOptional()
  @IsNumber()
  packageCount?: number;

  @IsString()
  loadingCountry!: string;

  @IsString()
  deliveryCountry!: string;

  @IsDateString()
  date!: string;
}
