import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ShipmentPackageLineDto } from './shipment-package-line.dto';

export class CreateShipmentDto {
  /** Klassischer Kunde (customers) */
  @ApiPropertyOptional({ format: 'uuid', description: 'Customer-ID (alternativ zu partnerId)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Stammdaten-Geschäftspartner (business_partners, z. B. type CUSTOMER) */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  loadingAddressId?: string;

  /** Wenn gesetzt: Server legt Snapshot-Adresse (loading) aus partner_locations an */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  loadingPartnerLocationId?: string;

  @ApiPropertyOptional({ example: 'FTL' })
  @IsOptional()
  @IsString()
  transportType?: string;

  @ApiPropertyOptional({ description: 'Kunden-eigene Referenz' })
  @IsOptional()
  @IsString()
  customerRef?: string;

  @ApiProperty({ format: 'uuid', description: 'Zielladestelle' })
  @IsUUID()
  deliveryAddressId!: string;

  @ApiProperty({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsString()
  loadingCountryCode!: string;

  @ApiProperty({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsString()
  deliveryCountryCode!: string;

  @ApiProperty({ format: 'date', example: '2026-05-20' })
  @IsDateString()
  loadingDate!: string;

  @IsOptional()
  @IsString()
  loadingTimeFrom?: string;

  @IsOptional()
  @IsString()
  loadingTimeTo?: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  deliveryDate!: string;

  @IsOptional()
  @IsString()
  deliveryTimeFrom?: string;

  @IsOptional()
  @IsString()
  deliveryTimeTo?: string;

  /** Wenn packageLines gesetzt: wird serverseitig aus Zeilen abgeleitet. */
  @ValidateIf((o: CreateShipmentDto) => !o.packageLines?.length)
  @IsString()
  packageType?: string;

  @ValidateIf((o: CreateShipmentDto) => !o.packageLines?.length)
  @IsNumber()
  packageCount?: number;

  @ValidateIf((o: CreateShipmentDto) => !o.packageLines?.length)
  @IsNumber()
  weightKg?: number;

  /** Mehrere Packstücke mit eigenen Maßen und Stapelbarkeit */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ShipmentPackageLineDto)
  packageLines?: ShipmentPackageLineDto[];

  @IsOptional()
  @IsNumber()
  ldm?: number;

  @IsOptional()
  @IsNumber()
  volumeM3?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  heightCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lengthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  widthCm?: number;

  @ApiPropertyOptional({ description: 'Gefahrgut-Flag — Sub muss ADR-Lizenz haben (T-3.2.1)' })
  @IsOptional()
  @IsBoolean()
  isHazmat?: boolean;

  @IsOptional()
  @IsBoolean()
  partnerDelivered?: boolean;

  @IsOptional()
  @IsString()
  hazmatClass?: string | null;

  @IsOptional()
  @IsString()
  hazmatUnNumber?: string | null;

  @IsOptional()
  @IsString()
  hazmatPackingGroup?: string | null;

  @IsOptional()
  @IsString()
  hazmatDescription?: string | null;

  @IsOptional()
  @IsString()
  incoterm?: string | null;

  @IsOptional()
  @IsString()
  freightPayer?: string | null;

  @IsOptional()
  @IsString()
  comment?: string | null;

  @IsOptional()
  @IsString()
  customerNote?: string | null;

  /**
   * Map-Routing P1: Manual classification-Override.
   * Wenn unset → Auto-Ableitung BE-side (classifyShipment-lib).
   */
  @ApiPropertyOptional({
    enum: ['SAMMELGUT', 'CHARTER_UMSCHLAG', 'CHARTER_DIREKT'],
    description:
      'Sendungs-Klassifizierung. Override; sonst auto-abgeleitet.',
  })
  @IsOptional()
  @IsString()
  classification?: 'SAMMELGUT' | 'CHARTER_UMSCHLAG' | 'CHARTER_DIREKT';
}
