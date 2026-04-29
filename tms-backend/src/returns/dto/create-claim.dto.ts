import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateClaimDto {
  @IsUUID()
  shipmentId!: string;

  @IsOptional()
  @IsUUID()
  damageReportId?: string;

  @IsIn(['SCHADEN', 'VERLUST', 'LAUFZEIT', 'FEHLLIEFERUNG'])
  claimType!: string;

  @IsIn(['PARTNER', 'VERSENDER', 'VERSICHERUNG'])
  claimAgainst!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  claimAmountEur?: number;

  @IsOptional()
  @IsString()
  partnerRef?: string;

  @IsOptional()
  @IsString()
  deadlineDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  notes?: string;
}

