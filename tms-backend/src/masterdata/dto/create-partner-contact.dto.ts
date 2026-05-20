import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreatePartnerContactDto {
  @ApiProperty({
    example: 'BILLING',
    description: 'BILLING | TECHNICAL | DISPATCH | …',
  })
  @IsString()
  contactType!: string;

  @ApiProperty({ example: 'Anna Schmidt' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Buchhalterin' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: '+49 40 12345-100' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ example: 'anna.schmidt@partner.de' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Primärer Kontakt für diesen Typ' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
