import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class DailyPricePreviewDto {
  @ApiProperty({ example: 'DE' })
  @IsString()
  originCountry!: string;

  @ApiProperty({ example: 'AT' })
  @IsString()
  destCountry!: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  ldm!: number;

  @ApiProperty({ example: 250 })
  @Type(() => Number)
  @IsNumber()
  weightKg!: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stopCount?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  relationId?: string | null;
}
