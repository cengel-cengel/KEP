import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateTourDto {
  @IsOptional()
  @IsDateString()
  tourDate?: string;

  @IsOptional()
  @IsString()
  subcontractorId?: string | null;

  @IsOptional()
  @IsNumber()
  plannedCost?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
