/**
 * C2-H: Swagger-annotated. DTO standalone (kein PartialType-Parent).
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddShipmentToPreCarriageTourDto {
  @ApiProperty({ format: 'uuid', description: 'Shipment ID' })
  @IsUUID()
  shipmentId!: string;
}
