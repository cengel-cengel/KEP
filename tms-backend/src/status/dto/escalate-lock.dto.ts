import { IsUUID } from 'class-validator';

export class EscalateLockDto {
  @IsUUID()
  escalatedTo!: string;
}
