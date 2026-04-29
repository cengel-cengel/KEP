import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsDecimal,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID()
  customerId!: string;

  @IsString()
  invoiceNumber?: string;

  @Type(() => Date)
  @IsDate()
  invoiceDate!: Date;

  @Type(() => Date)
  @IsDate()
  dueDate!: Date;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  shipmentIds!: string[];

  @IsOptional()
  @IsDecimal()
  vatRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
