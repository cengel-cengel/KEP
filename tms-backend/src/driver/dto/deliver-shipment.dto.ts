import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class DeliverShipmentDto {
  @ApiProperty({ example: 'Anna Schmidt' })
  @IsString()
  recipientName: string;

  @ApiProperty({ description: 'Unterschrift als base64-PNG' })
  @IsString()
  signature_base64: string;

  @ApiPropertyOptional({ description: 'POD-Foto als base64-JPEG' })
  @IsOptional()
  @IsString()
  photo_base64?: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  delivered_at: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
