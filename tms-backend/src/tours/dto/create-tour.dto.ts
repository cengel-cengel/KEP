import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

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
}
