import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class PlaceShipmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;

  @ApiProperty({
    example: 'A-12-03',
    description: 'Hall-Location-Code (z.B. Hall-Reihe-Stellplatz)',
  })
  @IsString()
  locationCode!: string;
}
