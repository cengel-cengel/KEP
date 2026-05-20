import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConditionRateDto } from './condition-rate.dto';

export class CreateConditionDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  customerId!: string;

  @ApiPropertyOptional({ example: 'Standard-Tarif DE-DE 2026' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'DE', minLength: 2, maxLength: 2 })
  @IsOptional()
  @IsString()
  countryFrom?: string | null;

  @ApiPropertyOptional({ example: 'AT', minLength: 2, maxLength: 2 })
  @IsOptional()
  @IsString()
  countryTo?: string | null;

  @ApiProperty({
    enum: ['weight', 'ldm', 'flat'],
    description: 'Tarif-Basis',
  })
  @IsString()
  basis!: 'weight' | 'ldm' | 'flat';

  @ApiProperty({ format: 'date', example: '2026-01-01' })
  @IsDateString()
  validFrom!: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  validTo?: string | null;

  @ApiPropertyOptional({ example: 25, description: 'Mindest-Frachtgebühr €' })
  @IsOptional()
  @IsNumber()
  minCharge?: number;

  @ApiPropertyOptional({ example: 8.5, description: 'Diesel-Zuschlag %' })
  @IsOptional()
  @IsNumber()
  fuelSurchargePct?: number;

  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({ type: [ConditionRateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionRateDto)
  rates!: ConditionRateDto[];
}
