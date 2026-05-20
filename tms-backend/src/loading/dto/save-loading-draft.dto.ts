import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

class SaveLoadingDraftItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  shipmentId!: string;

  @ApiProperty({ minimum: 0, example: 120 })
  @IsInt()
  @Min(0)
  xPosCm!: number;

  @ApiProperty({ minimum: 0, example: 80 })
  @IsInt()
  @Min(0)
  yPosCm!: number;

  @ApiPropertyOptional({ description: '0 oder 90' })
  @IsOptional()
  @IsInt()
  rotationAngle?: number;

  @ApiPropertyOptional({ minimum: 1, description: '1 = Boden, 2 = Stapel' })
  @IsOptional()
  @IsInt()
  @Min(1)
  stackLevel?: number;
}

export class SaveLoadingDraftDto {
  @ApiProperty({ type: [SaveLoadingDraftItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  items!: SaveLoadingDraftItemDto[];
}
