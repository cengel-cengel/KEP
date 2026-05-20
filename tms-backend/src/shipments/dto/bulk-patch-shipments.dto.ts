import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transportType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  relationId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  tourId?: string | null;
}

export class BulkPatchShipmentsDto {
  @ApiProperty({
    type: [String],
    description: 'Shipment-UUIDs (mind. 1)',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiProperty({ type: BulkPatchShipmentsPatchDto })
  @IsObject()
  @ValidateNested()
  @Type(() => BulkPatchShipmentsPatchDto)
  patch!: BulkPatchShipmentsPatchDto;
}
