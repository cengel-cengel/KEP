import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class ConditionRateDto {
  @ApiProperty({ example: 0, description: 'Tarif-Range Untergrenze (kg/ldm)' })
  @IsNumber()
  fromValue!: number;

  @ApiProperty({ example: 500, description: 'Tarif-Range Obergrenze (kg/ldm)' })
  @IsNumber()
  toValue!: number;

  @ApiProperty({ example: 1.85, description: 'Tarif für diesen Range' })
  @IsNumber()
  rate!: number;
}
