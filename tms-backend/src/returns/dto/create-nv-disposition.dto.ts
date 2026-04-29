import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import type { DriverProblemType } from '../../driver/dto/report-problem.dto';

export class CreateNvDispositionDto {
  @IsUUID()
  shipmentId!: string;

  @IsIn([
    'NICHT_ANGETROFFEN',
    'VERWEIGERT',
    'ADRESSE_FALSCH',
    'BESCHAEDIGT',
    'ZEITFENSTER_VERPASST',
    'SONSTIGES',
  ])
  problemType!: DriverProblemType;

  @IsOptional()
  @IsString()
  dispositionType?: string | null;

  @IsOptional()
  @IsString()
  driverNotes?: string;

  @IsOptional()
  @IsString()
  driverPhotoBase64?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * Aus Driver-App: created_by ist optional.
   * Für Dispatcher/Dispatcher-UI: kann gesetzt werden.
   */
  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @IsOptional()
  @IsBoolean()
  requiresAdvisory?: boolean;
}

