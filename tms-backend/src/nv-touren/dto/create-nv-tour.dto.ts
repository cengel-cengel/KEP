import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const NV_TOUR_STATUS = [
  'PLANNING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export class CreateNvTourDto {
  @IsUUID()
  nv_stamm_tour_id!: string;

  @IsDateString()
  datum!: string;

  @IsOptional()
  @IsUUID()
  subunternehmer_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  fahrzeug_typ?: string | null;

  @IsOptional()
  @IsString()
  notizen?: string | null;

  @IsOptional()
  @IsIn(NV_TOUR_STATUS as readonly string[])
  status?: string;
}
