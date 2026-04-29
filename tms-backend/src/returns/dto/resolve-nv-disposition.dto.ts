import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ResolveNvDispositionDto {
  @IsIn(['RETRY', 'RETURN', 'SELF_PICKUP', 'STORAGE'])
  dispositionType!: string;

  // RETRY
  @IsOptional()
  @IsDateString()
  retryDate?: string;

  @IsOptional()
  @IsString()
  retryTimeFrom?: string;

  @IsOptional()
  @IsString()
  retryTimeTo?: string;

  @IsOptional()
  retryRequiresAdvisory?: boolean;

  @IsOptional()
  @IsString()
  retryNotes?: string;

  // RETURN
  @IsOptional()
  @IsNumber()
  @Min(0)
  returnCostEur?: number;

  @IsOptional()
  @IsString()
  returnCostBearer?: string;

  @IsOptional()
  @IsString()
  returnReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // SELF_PICKUP
  @IsOptional()
  @IsDateString()
  selfPickupUntilDate?: string;

  @IsOptional()
  @IsString()
  selfPickupNotes?: string;

  // STORAGE
  @IsOptional()
  @IsUUID()
  storageHallLocationId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  storageDailyRate?: number;
}

