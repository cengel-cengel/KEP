import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreatePackageItemDto {
  @IsUUID('4')
  shipmentId!: string;

  @IsOptional()
  @IsString()
  packageType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsInt()
  @Min(1)
  lengthCm!: number;

  @IsInt()
  @Min(1)
  widthCm!: number;

  @IsInt()
  @Min(1)
  heightCm!: number;

  @IsNumber()
  weightKg!: number;

  @IsOptional()
  @IsBoolean()
  stackable?: boolean;
}

export class UpdatePackageItemDto {
  @IsOptional()
  @IsString()
  packageType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  lengthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  widthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @IsOptional()
  @IsBoolean()
  stackable?: boolean;
}
