import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class DatevExportDto {
  @ApiProperty({ type: [String], description: 'Invoice-UUIDs für Datev-Export' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  invoiceIds!: string[];
}
