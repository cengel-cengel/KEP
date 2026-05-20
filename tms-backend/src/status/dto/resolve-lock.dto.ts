import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResolveLockDto {
  @ApiProperty({ minLength: 1, description: 'Pflicht-Auflösungs-Notiz' })
  @IsString()
  @MinLength(1, { message: 'Auflösungsnotiz ist erforderlich' })
  resolutionNotes!: string;
}
