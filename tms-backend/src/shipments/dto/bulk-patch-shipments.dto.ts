import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkPatchShipmentsPatchDto {
  @IsOptional()
  @IsString()
  transportType?: string;

  @IsOptional()
  @IsString()
  relationId?: string | null;

  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @IsOptional()
  @IsString()
  tourId?: string | null;
}

export class BulkPatchShipmentsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids!: string[];

  @IsObject()
  @ValidateNested()
  @Type(() => BulkPatchShipmentsPatchDto)
  patch!: BulkPatchShipmentsPatchDto;
}
