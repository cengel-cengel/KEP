import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateSurplusItemDto {
  @IsUUID()
  tourId!: string;

  @IsString()
  description!: string;

  @IsNumber()
  @Min(0)
  weightKg!: number;

  @IsInt()
  @Min(1)
  packageCount!: number;

  @IsOptional()
  @IsString()
  photoBase64?: string;

  @IsOptional()
  @IsString()
  scanCode?: string;

  @IsOptional()
  @IsUUID()
  hallLocationId?: string;

  createdBy?: string;
}

