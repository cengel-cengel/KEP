import { IsUUID } from 'class-validator';

export class AssignSubConditionDto {
  @IsUUID()
  conditionId!: string;
}
