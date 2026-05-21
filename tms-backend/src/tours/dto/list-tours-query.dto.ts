/**
 * C2-H: Swagger-annotated Query-DTO. Standalone (kein PartialType).
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListToursQueryDto {
  @ApiPropertyOptional({
    description: 'Filter (komma-sep. erlaubt: planned,dispatched,...).',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-05-21' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
