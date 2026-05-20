import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MatchSurplusItemDto {
  @ApiProperty({ format: 'uuid', description: 'Shipment-ID die als Owner zugewiesen wird' })
  @IsUUID()
  shipmentId!: string;
}
