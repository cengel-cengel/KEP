import { IsIn, IsOptional, IsString } from 'class-validator';

export const DRIVER_PROBLEM_TYPES = [
  'NICHT_ANGETROFFEN',
  'VERWEIGERT',
  'ADRESSE_FALSCH',
  'BESCHAEDIGT',
  'ZEITFENSTER_VERPASST',
  'SONSTIGES',
] as const;

export type DriverProblemType = (typeof DRIVER_PROBLEM_TYPES)[number];

export class ReportProblemDto {
  @IsString()
  @IsIn([...DRIVER_PROBLEM_TYPES])
  problem_type: DriverProblemType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  photo_base64?: string;
}
