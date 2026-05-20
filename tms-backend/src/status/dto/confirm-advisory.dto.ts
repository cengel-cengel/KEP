import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class ConfirmAdvisoryDto {
  @ApiProperty({ format: 'date', example: '2026-05-21' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledDate!: string;

  @ApiPropertyOptional({ example: '08:00', description: 'HH:mm' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  timeFrom?: string;

  @ApiPropertyOptional({ example: '12:00', description: 'HH:mm' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  timeTo?: string;
}
