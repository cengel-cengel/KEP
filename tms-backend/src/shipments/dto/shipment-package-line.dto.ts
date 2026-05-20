import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  Min,
} from 'class-validator';

const PKG_TYPES = [
  'pallet_euro',
  'pallet_one_way',
  'box',
  'drum',
  'bulk',
  'coil',
  'container',
  'other',
] as const;

export class ShipmentPackageLineDto {
  @ApiProperty({ enum: PKG_TYPES })
  @IsIn(PKG_TYPES as readonly string[])
  packageType!: string;

  @ApiProperty({ minimum: 1, example: 4 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @ApiProperty({ minimum: 1, example: 120 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  lengthCm!: number;

  @ApiProperty({ minimum: 1, example: 80 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  widthCm!: number;

  @ApiProperty({ minimum: 1, example: 120 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  heightCm!: number;

  /** Gesamtgewicht der Zeile (alle Stück) */
  @ApiProperty({ minimum: 0, example: 1000, description: 'Gesamtgewicht aller Stück' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weightKg!: number;

  @ApiProperty()
  @IsBoolean()
  @Type(() => Boolean)
  stackable!: boolean;
}
