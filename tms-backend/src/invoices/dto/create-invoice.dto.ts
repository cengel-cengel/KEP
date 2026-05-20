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

export class CreateInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ description: 'Auto-Generated wenn leer' })
  @IsString()
  invoiceNumber?: string;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  invoiceDate!: Date;

  @ApiProperty({ format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dueDate!: Date;

  @ApiProperty({ type: [String], description: 'UUIDs der Sendungen' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  shipmentIds!: string[];

  @ApiPropertyOptional({ example: 19, description: 'MwSt-Satz in %' })
  @IsOptional()
  @IsDecimal()
  vatRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
