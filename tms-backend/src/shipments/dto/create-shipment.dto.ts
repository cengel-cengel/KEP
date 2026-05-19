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
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Stammdaten-Geschäftspartner (business_partners, z. B. type CUSTOMER) */
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsOptional()
  @IsUUID()
  loadingAddressId?: string;

  /** Wenn gesetzt: Server legt Snapshot-Adresse (loading) aus partner_locations an */
  @IsOptional()
  @IsUUID()
  loadingPartnerLocationId?: string;

  @IsOptional()
  @IsString()
  transportType?: string;

  @IsOptional()
  @IsString()
  customerRef?: string;

  @IsUUID()
  deliveryAddressId!: string;

  @IsString()
  loadingCountryCode!: string;

  @IsString()
  deliveryCountryCode!: string;

  @IsDateString()
  loadingDate!: string;

  @IsOptional()
  @IsString()
  loadingTimeFrom?: string;

  @IsOptional()
  @IsString()
  loadingTimeTo?: string;

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
}
