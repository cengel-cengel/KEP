import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ type: [String], description: 'Customer-UUIDs für Bulk-Invoice' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  customerIds!: string[];

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dateFrom!: Date;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dateTo!: Date;

  @ApiPropertyOptional({ example: 19 })
  @IsOptional()
  @IsDecimal()
  vatRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
