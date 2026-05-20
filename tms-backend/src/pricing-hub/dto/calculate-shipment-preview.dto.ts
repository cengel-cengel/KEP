import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CalculateShipmentPreviewDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  businessPartnerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subcontractorId?: string | null;

  @ApiProperty({ example: '20457' })
  @IsString()
  originZip!: string;

  @ApiProperty({ example: 'DE' })
  @IsString()
  originCountry!: string;

  @ApiProperty({ example: '80331' })
  @IsString()
  destZip!: string;

  @ApiProperty({ example: 'DE' })
  @IsString()
  destCountry!: string;

  @ApiProperty({ minimum: 0, example: 250 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightKg!: number;

  @ApiProperty({ minimum: 0, example: 2 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ldm!: number;

  @ApiProperty({ minimum: 0, example: 1.2 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cbm!: number;

  @ApiProperty({ minimum: 1, example: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  packageCount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isHazmat?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isTimeslot?: boolean;
}
