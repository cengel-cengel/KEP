import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { address_type } from '../../../generated/prisma';

export class CreateAddressDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ enum: address_type })
  @IsEnum(address_type)
  type!: address_type;

  @ApiProperty({ maxLength: 200, example: 'KED Hauptlager' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name2?: string;

  @ApiProperty({ maxLength: 200, example: 'Hafenstr. 12' })
  @IsString()
  @MaxLength(200)
  street!: string;

  @ApiProperty({ maxLength: 10, example: '20457' })
  @IsString()
  @MaxLength(10)
  zip!: string;

  @ApiProperty({ maxLength: 100, example: 'Hamburg' })
  @IsString()
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional({ maxLength: 2, example: 'DE' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 53.55 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 9.99 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}
