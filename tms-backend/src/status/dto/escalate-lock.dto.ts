import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class EscalateLockDto {
  @ApiProperty({ format: 'uuid', description: 'User-ID an die eskaliert wird' })
  @IsUUID()
  escalatedTo!: string;
}
