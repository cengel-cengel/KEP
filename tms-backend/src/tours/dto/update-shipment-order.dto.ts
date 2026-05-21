/**
 * C2-H: Swagger-annotated. DTO standalone (kein PartialType-Parent).
 * Trotz "Update" im Namen: setzt neue Order (full replacement),
 * kein partial-merge → PartialType wäre semantisch falsch.
 */
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class UpdateShipmentOrderDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Neue Stop-Reihenfolge (full replacement).',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  shipmentIds!: string[];
}
