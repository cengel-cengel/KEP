import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CalculateShipmentPreviewDto {
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  businessPartnerId?: string | null;

  @IsOptional()
  @IsUUID()
  subcontractorId?: string | null;

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
  @Min(0)
  weightKg!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ldm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cbm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  packageCount!: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isHazmat?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isTimeslot?: boolean;
}

