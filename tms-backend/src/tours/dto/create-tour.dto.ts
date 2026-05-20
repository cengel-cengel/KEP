import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateTourDto {
  @ApiProperty({ format: 'date', example: '2026-05-20' })
  @IsDateString()
  tourDate!: string;

  @ApiPropertyOptional({ example: 'T20260520-001' })
  @IsOptional()
  @IsString()
  tourNumber?: string;

  @ApiPropertyOptional({ description: 'Hub-Start als freier String (legacy)' })
  @IsOptional()
  @IsString()
  startLocation?: string;

  @ApiPropertyOptional({ description: 'Hub-Ende als freier String (legacy)' })
  @IsOptional()
  @IsString()
  endLocation?: string;

  @ApiPropertyOptional({ example: 13.6, description: 'Max LDM Trailer-Kapazität' })
  @IsOptional()
  @IsNumber()
  maxLdm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  hubStartAddressId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  hubEndAddressId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subcontractorId?: string;
}
