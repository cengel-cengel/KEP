import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class MoveShipmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;

  @ApiProperty({ example: 'B-04-01', description: 'Ziel-Location-Code' })
  @IsString()
  toLocationCode!: string;
}
