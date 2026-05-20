import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignReturnTourDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tourId!: string;
}
