import { IsUUID } from 'class-validator';

export class AddShipmentDto {
  @IsUUID()
  shipmentId!: string;
}
