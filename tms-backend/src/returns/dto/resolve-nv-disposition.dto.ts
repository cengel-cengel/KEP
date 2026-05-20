import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const DISPOSITION_TYPES = ['RETRY', 'RETURN', 'SELF_PICKUP', 'STORAGE'] as const;

export class ResolveNvDispositionDto {
  @ApiProperty({ enum: DISPOSITION_TYPES })
  @IsIn(DISPOSITION_TYPES as readonly string[])
  dispositionType!: string;

  // RETRY
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  retryDate?: string;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  retryTimeFrom?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  retryTimeTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  retryRequiresAdvisory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  retryNotes?: string;

  // RETURN
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  returnCostEur?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnCostBearer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  // SELF_PICKUP
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  selfPickupUntilDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  selfPickupNotes?: string;

  // STORAGE
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  storageHallLocationId?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  storageDailyRate?: number;
}
