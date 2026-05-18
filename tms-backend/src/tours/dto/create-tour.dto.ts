import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateTourDto {
  @IsDateString()
  tourDate!: string;

  @IsOptional()
  @IsString()
  tourNumber?: string;

  @IsOptional()
  @IsString()
  startLocation?: string;

  @IsOptional()
  @IsString()
  endLocation?: string;

  @IsOptional()
  @IsNumber()
  maxLdm?: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsUUID()
  hubStartAddressId?: string;

  @IsOptional()
  @IsUUID()
  hubEndAddressId?: string;

  @IsOptional()
  @IsUUID()
  subcontractorId?: string;
}
