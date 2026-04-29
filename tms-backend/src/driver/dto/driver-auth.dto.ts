import { IsString, Length, Matches, MinLength } from 'class-validator';

export class DriverTokenAuthDto {
  @IsString()
  @MinLength(10)
  token: string;
}

export class DriverPinAuthDto {
  @IsString()
  @Length(6, 6, { message: 'PIN muss 6 Ziffern haben' })
  @Matches(/^\d{6}$/, { message: 'PIN nur Ziffern' })
  pin: string;
}
