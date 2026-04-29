import { IsDateString, IsOptional, IsString } from 'class-validator';

export class DeliverShipmentDto {
  @IsString()
  recipientName: string;

  @IsString()
  signature_base64: string;

  @IsOptional()
  @IsString()
  photo_base64?: string;

  @IsDateString()
  delivered_at: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
