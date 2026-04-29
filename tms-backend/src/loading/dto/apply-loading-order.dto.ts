import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ApplyLoadingOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  shipmentIds!: string[];
}

