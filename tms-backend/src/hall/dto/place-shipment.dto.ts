import { IsString, IsUUID } from 'class-validator';

export class PlaceShipmentDto {
  @IsUUID()
  shipmentId!: string;

  @IsString()
  locationCode!: string;
}
