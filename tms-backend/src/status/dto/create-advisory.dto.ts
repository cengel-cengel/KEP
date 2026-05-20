import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAdvisoryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;

  @ApiProperty({ example: 'ZUSTELL_AVISO', description: 'Advisory-Typ' })
  @IsString()
  advisoryType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Portal-Booking-URL' })
  @IsOptional()
  @IsString()
  portalUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  portalBookingRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
