import { IsIn } from 'class-validator';

export class SetSurplusStatusDto {
  @IsIn(['nachbordero', 'entsorgt'])
  status!: 'nachbordero' | 'entsorgt';
}

