import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateStatusEventDto {
  @IsUUID()
  shipmentId!: string;

  @IsString()
  eventType!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  signatureData?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isAutomatic?: boolean;
}
