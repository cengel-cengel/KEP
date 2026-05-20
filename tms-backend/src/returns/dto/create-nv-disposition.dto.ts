import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import type { DriverProblemType } from '../../driver/dto/report-problem.dto';

const PROBLEM_TYPES = [
  'NICHT_ANGETROFFEN',
  'VERWEIGERT',
  'ADRESSE_FALSCH',
  'BESCHAEDIGT',
  'ZEITFENSTER_VERPASST',
  'SONSTIGES',
] as const;

export class CreateNvDispositionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;

  @ApiProperty({ enum: PROBLEM_TYPES })
  @IsIn(PROBLEM_TYPES as readonly string[])
  problemType!: DriverProblemType;

  @ApiPropertyOptional({ description: 'NACHLIEFERUNG | NEUE_ADRESSE | …' })
  @IsOptional()
  @IsString()
  dispositionType?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverNotes?: string;

  @ApiPropertyOptional({ description: 'Base64-JPEG vom Driver' })
  @IsOptional()
  @IsString()
  driverPhotoBase64?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * Aus Driver-App: created_by ist optional.
   * Für Dispatcher/Dispatcher-UI: kann gesetzt werden.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @ApiPropertyOptional({ description: 'Auto-erstelle Advisory bei Resolve?' })
  @IsOptional()
  @IsBoolean()
  requiresAdvisory?: boolean;
}
