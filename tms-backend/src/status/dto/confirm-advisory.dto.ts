import { IsOptional, IsString, Matches } from 'class-validator';

export class ConfirmAdvisoryDto {
  /** YYYY-MM-DD */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledDate!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  timeFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  timeTo?: string;
}
