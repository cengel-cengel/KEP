import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'HAMBURG-LAGER', description: 'Eindeutiger Key innerhalb des Partners' })
  @IsString()
  locationKey!: string;

  @ApiPropertyOptional({ example: 'WAREHOUSE', description: 'WAREHOUSE | OFFICE | HUB | …' })
  @IsOptional()
  @IsString()
  locationType?: string;

  @ApiProperty({ example: 'Hamburg-Lager' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name2?: string;

  @ApiProperty({ example: 'Hafenstraße 12' })
  @IsString()
  street!: string;

  @ApiProperty({ example: '20457' })
  @IsString()
  zip!: string;

  @ApiProperty({ example: 'Hamburg' })
  @IsString()
  city!: string;

  @ApiPropertyOptional({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ example: 53.55 })
  @IsOptional()
  @IsDecimal()
  lat?: number;

  @ApiPropertyOptional({ example: 9.99 })
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
