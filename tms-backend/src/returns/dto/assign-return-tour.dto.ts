import { IsUUID } from 'class-validator';

export class AssignReturnTourDto {
  @IsUUID()
  tourId!: string;
}

