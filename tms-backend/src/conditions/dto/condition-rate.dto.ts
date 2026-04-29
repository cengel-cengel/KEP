import { IsNumber } from 'class-validator';

export class ConditionRateDto {
  @IsNumber()
  fromValue!: number;

  @IsNumber()
  toValue!: number;

  @IsNumber()
  rate!: number;
}
