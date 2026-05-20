import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ApplyLoadingOrderDto {
  @ApiProperty({
    type: [String],
    description: 'Shipment-UUIDs in gewünschter Belade-Reihenfolge',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  shipmentIds!: string[];
}
