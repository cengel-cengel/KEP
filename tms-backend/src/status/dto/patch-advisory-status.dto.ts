import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

const ADVISORY_STATUSES = ['open', 'contacted', 'confirmed', 'failed'] as const;

export class PatchAdvisoryStatusDto {
  @ApiProperty({ enum: ADVISORY_STATUSES })
  @IsString()
  @IsIn(ADVISORY_STATUSES as readonly string[])
  status!: 'open' | 'contacted' | 'confirmed' | 'failed';
}
