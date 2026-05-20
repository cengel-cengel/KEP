import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLockDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;

  @ApiProperty({
    example: 'PRICING',
    description: 'PRICING | DOCUMENTS | PARTNER | …',
  })
  @IsString()
  lockType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}
