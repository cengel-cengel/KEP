import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  Min,
} from 'class-validator';

export class ShipmentPackageLineDto {
  @IsIn([
    'pallet_euro',
    'pallet_one_way',
    'box',
    'drum',
    'bulk',
    'coil',
    'container',
    'other',
  ])
  packageType!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  lengthCm!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  widthCm!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  heightCm!: number;

  /** Gesamtgewicht der Zeile (alle Stück) */
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weightKg!: number;

  @IsBoolean()
  @Type(() => Boolean)
  stackable!: boolean;
}
