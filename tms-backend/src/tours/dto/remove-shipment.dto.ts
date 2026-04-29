import { IsUUID } from 'class-validator';

export class RemoveShipmentDto {
  @IsUUID()
  shipmentId!: string;
}
