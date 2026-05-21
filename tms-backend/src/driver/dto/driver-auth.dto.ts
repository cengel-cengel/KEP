/**
 * C2-H: Swagger-annotated. DTOs standalone (kein PartialType-Parent).
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, MinLength } from 'class-validator';

export class DriverTokenAuthDto {
  @ApiProperty({ minLength: 10, description: 'Token aus Stamm-Pairing.' })
  @IsString()
  @MinLength(10)
  token: string;
}

export class DriverPinAuthDto {
  @ApiProperty({
    minLength: 6,
    maxLength: 6,
    pattern: '^\\d{6}$',
    example: '123456',
  })
  @IsString()
  @Length(6, 6, { message: 'PIN muss 6 Ziffern haben' })
  @Matches(/^\d{6}$/, { message: 'PIN nur Ziffern' })
  pin: string;
}
