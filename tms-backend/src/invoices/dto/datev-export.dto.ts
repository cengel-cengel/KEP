import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class DatevExportDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  invoiceIds!: string[];
}
