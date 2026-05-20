import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;

  @IsOptional()
  @IsNumber()
  creditLimit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  datevAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultIncoterm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  invoiceEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  ediPartnerId?: string;

  @IsOptional()
  @IsNumber()
  minContributionPct?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /** M-1: Priority-Tier für Customer-Score-Faktor. */
  @IsOptional()
  @IsIn(['VIP', 'A', 'B', 'C'])
  priorityTier?: 'VIP' | 'A' | 'B' | 'C';

  /** M-1.1: Aktivierungs-Status (Soft-Disable). */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
