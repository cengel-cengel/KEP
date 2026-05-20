import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class ShipmentPricePreviewDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsString()
  loadingCountryCode!: string;

  @ApiProperty({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsString()
  deliveryCountryCode!: string;

  @ApiProperty({ format: 'date', example: '2026-05-20' })
  @IsDateString()
  loadingDate!: string;

  @ApiProperty({ example: 250 })
  @IsNumber()
  weightKg!: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  ldm?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  packageCount?: number;
}
