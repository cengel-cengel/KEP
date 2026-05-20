import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  shipmentId!: string;

  @ApiPropertyOptional({ example: 'pallet_euro' })
  @IsOptional()
  @IsString()
  packageType?: string;

  @ApiPropertyOptional({ minimum: 1, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({ minimum: 1, example: 120 })
  @IsInt()
  @Min(1)
  lengthCm!: number;

  @ApiProperty({ minimum: 1, example: 80 })
  @IsInt()
  @Min(1)
  widthCm!: number;

  @ApiProperty({ minimum: 1, example: 120 })
  @IsInt()
  @Min(1)
  heightCm!: number;

  @ApiProperty({ example: 250 })
  @IsNumber()
  weightKg!: number;

  @ApiPropertyOptional({ description: 'Stapelbar (default true)' })
  @IsOptional()
  @IsBoolean()
  stackable?: boolean;
}

export class UpdatePackageItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  packageType?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  lengthCm?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  widthCm?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  heightCm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stackable?: boolean;
}
