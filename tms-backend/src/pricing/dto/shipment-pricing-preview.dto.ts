/**
 * C2-H: Swagger-annotated. DTO standalone (kein PartialType-Parent).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ShipmentPricingPreviewDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  businessPartnerId?: string | null;

  @ApiProperty({ example: '70173' })
  @IsString()
  originZip!: string;

  @ApiProperty({ example: 'DE' })
  @IsString()
  originCountry!: string;

  @ApiProperty({ example: '10115' })
  @IsString()
  destZip!: string;

  @ApiProperty({ example: 'DE' })
  @IsString()
  destCountry!: string;

  @ApiProperty({ description: 'Lademeter' })
  @Type(() => Number)
  @IsNumber()
  ldm!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  weightKg!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isHazmat?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stopCount?: number;
}
