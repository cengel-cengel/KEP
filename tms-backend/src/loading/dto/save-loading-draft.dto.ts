import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

class SaveLoadingDraftItemDto {
  @IsUUID('4')
  shipmentId!: string;

  @IsInt()
  @Min(0)
  xPosCm!: number;

  @IsInt()
  @Min(0)
  yPosCm!: number;

  @IsOptional()
  @IsInt()
  rotationAngle?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  stackLevel?: number;
}

export class SaveLoadingDraftDto {
  @IsArray()
  @ArrayNotEmpty()
  items!: SaveLoadingDraftItemDto[];
}

