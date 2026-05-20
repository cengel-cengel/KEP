import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Müller GmbH', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Niederlassung Hamburg', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name2?: string;

  @ApiPropertyOptional({ example: 'DE123456789', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatId?: string;

  @ApiPropertyOptional({ example: 30, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @IsNumber()
  creditLimit?: number;

  @ApiPropertyOptional({ example: '70000', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  datevAccount?: string;

  @ApiPropertyOptional({ example: 'EXW', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultIncoterm?: string;

  @ApiPropertyOptional({ example: 'invoice@mueller.de', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  invoiceEmail?: string;

  @ApiPropertyOptional({ example: 'EDI-MUE-001', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ediPartnerId?: string;

  @ApiPropertyOptional({ example: 12.5, description: 'Mindest-Deckungsbeitrag in %' })
  @IsOptional()
  @IsNumber()
  minContributionPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  /** M-1: Priority-Tier für Customer-Score-Faktor. */
  @ApiPropertyOptional({
    enum: ['VIP', 'A', 'B', 'C'],
    description: 'Customer-Tier für Score-Berechnung (M-1)',
  })
  @IsOptional()
  @IsIn(['VIP', 'A', 'B', 'C'])
  priorityTier?: 'VIP' | 'A' | 'B' | 'C';

  /** M-1.1: Aktivierungs-Status (Soft-Disable). */
  @ApiPropertyOptional({ example: true, description: 'Soft-Disable Flag' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
