import { IsIn } from 'class-validator';

export class UpdateInvoiceStatusDto {
  @IsIn(['draft', 'sent', 'paid', 'overdue', 'cancelled'] as any)
  status!: string;
}
