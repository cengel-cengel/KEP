import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class SetSurplusStatusDto {
  @ApiProperty({ enum: ['nachbordero', 'entsorgt'] })
  @IsIn(['nachbordero', 'entsorgt'])
  status!: 'nachbordero' | 'entsorgt';
}
