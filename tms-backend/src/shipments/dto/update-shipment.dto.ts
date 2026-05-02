import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateShipmentDto {
  @IsOptional()
  @IsString()
  transportType?: string;

  @IsOptional()
  @IsString()
  customerRef?: string;

  @IsOptional()
  @IsString()
  loadingAddressId?: string;

  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @IsOptional()
  @IsDateString()
  loadingDate?: string;

  @IsOptional()
  @IsString()
  loadingTimeFrom?: string;

  @IsOptional()
  @IsString()
  loadingTimeTo?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  deliveryTimeFrom?: string;

  @IsOptional()
  @IsString()
  deliveryTimeTo?: string;

  @IsOptional()
  @IsString()
  packageType?: string;

  @IsOptional()
  @IsNumber()
  packageCount?: number;

  @IsOptional()
  @IsNumber()
  lengthCm?: number;

  @IsOptional()
  @IsNumber()
  widthCm?: number;

  @IsOptional()
  @IsNumber()
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  ldm?: number;

  @IsOptional()
  @IsNumber()
  volumeM3?: number;

  @IsOptional()
  @IsBoolean()
  isHazmat?: boolean;

  @IsOptional()
  @IsString()
  hazmatClass?: string | null;

  @IsOptional()
  @IsString()
  hazmatUnNumber?: string | null;

  @IsOptional()
  @IsString()
  hazmatPackingGroup?: string | null;

  @IsOptional()
  @IsString()
  hazmatDescription?: string | null;

  @IsOptional()
  @IsString()
  incoterm?: string | null;

  @IsOptional()
  @IsString()
  freightPayer?: string | null;

  @IsOptional()
  @IsString()
  comment?: string | null;

  @IsOptional()
  @IsString()
  customerNote?: string | null;
}
