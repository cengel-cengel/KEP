import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListToursQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
