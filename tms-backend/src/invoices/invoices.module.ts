import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { DatevExportService } from './datev-export.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, DatevExportService],
  exports: [InvoicesService, DatevExportService],
})
export class InvoicesModule {}
