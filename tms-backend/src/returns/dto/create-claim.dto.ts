import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

const CLAIM_TYPES = ['SCHADEN', 'VERLUST', 'LAUFZEIT', 'FEHLLIEFERUNG'] as const;
const CLAIM_AGAINST = ['PARTNER', 'VERSENDER', 'VERSICHERUNG'] as const;

export class CreateClaimDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  damageReportId?: string;

  @ApiProperty({ enum: CLAIM_TYPES })
  @IsIn(CLAIM_TYPES as readonly string[])
  claimType!: string;

  @ApiProperty({ enum: CLAIM_AGAINST })
  @IsIn(CLAIM_AGAINST as readonly string[])
  claimAgainst!: string;

  @ApiPropertyOptional({ minimum: 0, example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  claimAmountEur?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partnerRef?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-06-30' })
  @IsOptional()
  @IsString()
  deadlineDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
