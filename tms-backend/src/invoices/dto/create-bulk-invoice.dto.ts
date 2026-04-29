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

export class CreateBulkInvoiceDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  customerIds!: string[];

  @Type(() => Date)
  @IsDate()
  dateFrom!: Date;

  @Type(() => Date)
  @IsDate()
  dateTo!: Date;

  @IsOptional()
  @IsDecimal()
  vatRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
