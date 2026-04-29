import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreatePartnerDto } from './create-partner.dto';

class UpdatePartnerContactDto {
  @IsUUID()
  id!: string;

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

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdatePartnerContactDto)
  contacts?: UpdatePartnerContactDto[];
}
