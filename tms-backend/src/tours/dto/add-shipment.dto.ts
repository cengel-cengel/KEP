/**
 * C2-H: Swagger-annotated. DTO standalone (kein PartialType-Parent).
 * Convention: explicit @ApiProperty pro Feld; PartialType-Derivate
 * (z.B. UpdateXxxDto extends PartialType(CreateXxxDto)) erben das
 * Schema automatisch — dort keine doppelte Annotation.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddShipmentDto {
  @ApiProperty({ format: 'uuid', description: 'Shipment ID' })
  @IsUUID()
  shipmentId!: string;
}
