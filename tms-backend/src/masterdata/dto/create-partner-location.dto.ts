import {
  IsBoolean,
  IsDateString,
  IsDecimal,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePartnerLocationDto {
  @IsString()
  locationKey!: string;

  @IsOptional()
  @IsString()
  locationType?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  name2?: string;

  @IsString()
  street!: string;

  @IsString()
  zip!: string;

  @IsString()
  city!: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsDecimal()
  lat?: number;

  @IsOptional()
  @IsDecimal()
  lng?: number;

  // Zeitfenster Mo–Fr (optional): gleiche Uhrzeit für alle Werktage
  @IsOptional()
  @IsString()
  openingWeekFrom?: string;
  @IsOptional()
  @IsString()
  openingWeekTo?: string;

  // Einzeltage (optional, überschreiben nicht openingWeek*)
  @IsOptional()
  @IsString()
  openingMonFrom?: string;
  @IsOptional()
  @IsString()
  openingMonTo?: string;
  @IsOptional()
  @IsString()
  openingTueFrom?: string;
  @IsOptional()
  @IsString()
  openingTueTo?: string;
  @IsOptional()
  @IsString()
  openingWedFrom?: string;
  @IsOptional()
  @IsString()
  openingWedTo?: string;
  @IsOptional()
  @IsString()
  openingThuFrom?: string;
  @IsOptional()
  @IsString()
  openingThuTo?: string;
  @IsOptional()
  @IsString()
  openingFriFrom?: string;
  @IsOptional()
  @IsString()
  openingFriTo?: string;

  // optional: Samstag (optional)
  @IsOptional()
  @IsString()
  openingSatFrom?: string;

  @IsOptional()
  @IsString()
  openingSatTo?: string;

  @IsOptional()
  @IsBoolean()
  hasLoadingRamp?: boolean;

  @IsOptional()
  @IsInt()
  rampCount?: number;

  @IsOptional()
  @IsDecimal()
  maxVehicleLengthM?: number;

  @IsOptional()
  @IsBoolean()
  forkliftAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  appointmentRequired?: boolean;

  @IsOptional()
  @IsString()
  accessCode?: string;

  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;
}
