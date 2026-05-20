import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@kedglobal.de', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Password (plain, wird BE-side gehashed)' })
  @IsString()
  password!: string;
}
