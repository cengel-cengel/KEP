import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLockDto {
  @IsUUID()
  shipmentId!: string;

  @IsString()
  lockType!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}
