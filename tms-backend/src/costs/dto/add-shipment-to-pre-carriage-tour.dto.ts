import { IsUUID } from 'class-validator';

export class AddShipmentToPreCarriageTourDto {
  @IsUUID()
  shipmentId!: string;
}

