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
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  countryFrom?: string | null;

  @IsOptional()
  @IsString()
  countryTo?: string | null;

  @IsString()
  basis!: 'weight' | 'ldm' | 'flat';

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validTo?: string | null;

  @IsOptional()
  @IsNumber()
  minCharge?: number;

  @IsOptional()
  @IsNumber()
  fuelSurchargePct?: number;

  @IsBoolean()
  isActive!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConditionRateDto)
  rates!: ConditionRateDto[];
}
