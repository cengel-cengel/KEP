import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePreCarriageTourDto {
  @IsDateString()
  tourDate!: string; // yyyy-mm-dd

  @IsOptional()
  @IsString()
  subcontractorId?: string | null;

  @IsOptional()
  @IsNumber()
  totalCost?: number;

  @IsOptional()
  @IsString()
  costRateId?: string | null;

  @IsOptional()
  @IsNumber()
  distanceKm?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

