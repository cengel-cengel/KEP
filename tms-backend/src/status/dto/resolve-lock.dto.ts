import { IsString, MinLength } from 'class-validator';

export class ResolveLockDto {
  @IsString()
  @MinLength(1, { message: 'Auflösungsnotiz ist erforderlich' })
  resolutionNotes!: string;
}
