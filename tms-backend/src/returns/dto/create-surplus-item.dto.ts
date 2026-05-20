import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSurplusItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tourId!: string;

  @ApiProperty({ example: '1× Karton 60×40×30' })
  @IsString()
  description!: string;

  @ApiProperty({ minimum: 0, example: 12.5 })
  @IsNumber()
  @Min(0)
  weightKg!: number;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  packageCount!: number;

  @ApiPropertyOptional({ description: 'Base64-JPEG des Fundstücks' })
  @IsOptional()
  @IsString()
  photoBase64?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scanCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  hallLocationId?: string;

  createdBy?: string;
}
