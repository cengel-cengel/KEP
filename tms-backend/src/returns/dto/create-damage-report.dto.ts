import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDamageReportDto {
  @IsUUID()
  shipmentId!: string;

  @IsIn(['OPTISCH', 'VERDECKT', 'TOTALSCHADEN'])
  damageType!: string;

  @IsOptional()
  @IsIn(['VERPACKUNG', 'TRANSPORT', 'PARTNER', 'UNBEKANNT'])
  damageCause?: string;

  @IsString()
  damageDescription!: string;

  @IsOptional()
  @IsString()
  photoBase64_1?: string;

  @IsOptional()
  @IsString()
  photoBase64_2?: string;

  @IsOptional()
  @IsString()
  photoBase64_3?: string;

  @IsOptional()
  damageValueEur?: number;

  @IsOptional()
  @IsString()
  liabilityParty?: string;

  @IsOptional()
  @IsBoolean()
  insuranceClaim?: boolean;

  @IsOptional()
  @IsString()
  insuranceRef?: string;

  @IsOptional()
  @IsBoolean()
  reportedByDriver?: boolean;
}

