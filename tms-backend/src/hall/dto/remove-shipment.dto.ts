import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RemoveShipmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  shipmentId!: string;
}
