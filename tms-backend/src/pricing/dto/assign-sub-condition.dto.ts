import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignSubConditionDto {
  @ApiProperty({ format: 'uuid', description: 'Condition-ID die assigned wird' })
  @IsUUID()
  conditionId!: string;
}
