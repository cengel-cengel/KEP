import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CompleteHallCheckItemDto {
  @IsUUID()
  shipmentId!: string;

  @IsOptional()
  @IsString()
  actualStatus?: string;

  @IsOptional()
  @IsBoolean()
  isOk?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteHallCheckDto {
  @IsUUID()
  checkId!: string;

  @ValidateNested({ each: true })
  @Type(() => CompleteHallCheckItemDto)
  items!: CompleteHallCheckItemDto[];
}
