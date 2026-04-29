import { IsString, IsUUID } from 'class-validator';

export class MoveShipmentDto {
  @IsUUID()
  shipmentId!: string;

  @IsString()
  toLocationCode!: string;
}
