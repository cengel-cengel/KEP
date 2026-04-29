import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePartnerContactDto {
  @IsString()
  contactType!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
