import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const INVOICE_STATUSES = [
  'draft',
  'sent',
  'paid',
  'overdue',
  'cancelled',
] as const;

export class UpdateInvoiceStatusDto {
  @ApiProperty({ enum: INVOICE_STATUSES })
  @IsIn(INVOICE_STATUSES as readonly string[])
  status!: string;
}
