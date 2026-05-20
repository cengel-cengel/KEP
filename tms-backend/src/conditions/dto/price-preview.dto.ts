import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class ConditionPricePreviewDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ example: 250 })
  @IsNumber()
  weightKg!: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  ldm?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  packageCount?: number;

  @ApiProperty({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsString()
  loadingCountry!: string;

  @ApiProperty({ example: 'AT', minLength: 2, maxLength: 2 })
  @IsString()
  deliveryCountry!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  date!: string;
}
