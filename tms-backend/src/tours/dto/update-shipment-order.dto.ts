import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class UpdateShipmentOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  shipmentIds!: string[];
}

