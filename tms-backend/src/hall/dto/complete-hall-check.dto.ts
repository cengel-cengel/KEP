import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CompleteHallCheckItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;

  @ApiPropertyOptional({ description: 'OK | DAMAGED | MISSING | …' })
  @IsOptional()
  @IsString()
  actualStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOk?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteHallCheckDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  checkId!: string;

  @ApiProperty({ type: [CompleteHallCheckItemDto] })
  @ValidateNested({ each: true })
  @Type(() => CompleteHallCheckItemDto)
  items!: CompleteHallCheckItemDto[];
}
