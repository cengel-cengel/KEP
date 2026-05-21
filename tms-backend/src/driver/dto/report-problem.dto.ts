/**
 * C2-H: Swagger-annotated. DTO standalone (kein PartialType-Parent).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const DRIVER_PROBLEM_TYPES = [
  'NICHT_ANGETROFFEN',
  'VERWEIGERT',
  'ADRESSE_FALSCH',
  'BESCHAEDIGT',
  'ZEITFENSTER_VERPASST',
  'SONSTIGES',
] as const;

export type DriverProblemType = (typeof DRIVER_PROBLEM_TYPES)[number];

export class ReportProblemDto {
  @ApiProperty({ enum: DRIVER_PROBLEM_TYPES })
  @IsString()
  @IsIn([...DRIVER_PROBLEM_TYPES])
  problem_type: DriverProblemType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Base64 (optional Foto-Anhang)' })
  @IsOptional()
  @IsString()
  photo_base64?: string;
}
