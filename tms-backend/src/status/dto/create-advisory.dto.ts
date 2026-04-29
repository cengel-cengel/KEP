import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAdvisoryDto {
  @IsUUID()
  shipmentId!: string;

  @IsString()
  advisoryType!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  portalUrl?: string;

  @IsOptional()
  @IsString()
  portalBookingRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
