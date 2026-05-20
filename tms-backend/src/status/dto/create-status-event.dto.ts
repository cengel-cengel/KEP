import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateStatusEventDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;

  @ApiProperty({ example: 'DELIVERED' })
  @IsString()
  eventType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Hamburg Hauptlager' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional({ description: 'Base64-PNG' })
  @IsOptional()
  @IsString()
  signatureData?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ description: 'true = vom System, false = manuell' })
  @IsOptional()
  @IsBoolean()
  isAutomatic?: boolean;
}
