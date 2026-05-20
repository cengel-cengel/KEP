import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

const STATUSES = ['open', 'in_klaerung', 'abgeschlossen', 'abgewiesen'] as const;
const DAMAGE_TYPES = ['OPTISCH', 'VERDECKT', 'TOTALSCHADEN'] as const;
const DAMAGE_CAUSES = ['VERPACKUNG', 'TRANSPORT', 'PARTNER', 'UNBEKANNT'] as const;
const CLAIM_AGAINST = ['PARTNER', 'VERSENDER', 'VERSICHERUNG'] as const;

export class ResolveDamageReportDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as readonly string[])
  status!: string;

  @ApiPropertyOptional({ enum: DAMAGE_TYPES })
  @IsOptional()
  @IsIn(DAMAGE_TYPES as readonly string[])
  damageType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  damageValueEur?: number;

  @ApiPropertyOptional({ enum: DAMAGE_CAUSES })
  @IsOptional()
  @IsIn(DAMAGE_CAUSES as readonly string[])
  damageCause?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  liabilityParty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolutionNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  insuranceClaim?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  insuranceRef?: string;

  @ApiPropertyOptional({ description: 'Soll automatisch ein Claim erzeugt werden?' })
  @IsOptional()
  @IsBoolean()
  createClaim?: boolean;

  @ApiPropertyOptional({ enum: CLAIM_AGAINST })
  @IsOptional()
  @IsIn(CLAIM_AGAINST as readonly string[])
  claimAgainst?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  claimAmountEur?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  kulanzDecision?: boolean;
}
