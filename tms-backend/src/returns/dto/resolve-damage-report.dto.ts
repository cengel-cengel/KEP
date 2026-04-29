import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class ResolveDamageReportDto {
  @IsIn(['open', 'in_klaerung', 'abgeschlossen', 'abgewiesen'])
  status!: string;

  @IsOptional()
  @IsIn(['OPTISCH', 'VERDECKT', 'TOTALSCHADEN'])
  damageType?: string;

  @IsOptional()
  @IsNumber()
  damageValueEur?: number;

  @IsOptional()
  @IsIn(['VERPACKUNG', 'TRANSPORT', 'PARTNER', 'UNBEKANNT'])
  damageCause?: string;

  @IsOptional()
  @IsString()
  liabilityParty?: string;

  @IsOptional()
  @IsString()
  resolutionNotes?: string;

  @IsOptional()
  @IsBoolean()
  insuranceClaim?: boolean;

  @IsOptional()
  @IsString()
  insuranceRef?: string;

  @IsOptional()
  @IsBoolean()
  createClaim?: boolean;

  @IsOptional()
  @IsIn(['PARTNER', 'VERSENDER', 'VERSICHERUNG'])
  claimAgainst?: string;

  @IsOptional()
  @IsNumber()
  claimAmountEur?: number;

  @IsOptional()
  @IsBoolean()
  kulanzDecision?: boolean;
}

