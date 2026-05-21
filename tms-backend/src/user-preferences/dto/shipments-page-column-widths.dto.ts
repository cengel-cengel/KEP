/**
 * C2-H: Swagger-annotated. DTO standalone (kein PartialType-Parent).
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class ShipmentsPageColumnWidthsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description: 'Map<columnKey, widthPx>',
    example: { shipment_number: 120, customer: 180 },
  })
  @IsObject()
  columnWidths!: Record<string, number>;
}
