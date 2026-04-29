import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InvoicesService } from './invoices.service';
import type { Response } from 'express';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateBulkInvoiceDto } from './dto/create-bulk-invoice.dto';
import { DatevExportDto } from './dto/datev-export.dto';
import { UpdateInvoiceStatusDto } from './dto/update-invoice-status.dto';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  async findAll() {
    return this.invoices.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateInvoiceDto, @Req() req: any) {
    return this.invoices.createInvoice(dto, req.user.userId);
  }

  @Post('bulk')
  async createBulk(@Body() dto: CreateBulkInvoiceDto, @Req() req: any) {
    return this.invoices.createBulkInvoice(
      dto.customerIds,
      dto.dateFrom,
      dto.dateTo,
      req.user.userId,
      dto.vatRate,
      dto.notes,
    );
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.invoices.generateInvoicePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${id}.pdf"`,
    );
    return res.send(pdf);
  }

  @Post('datev-export')
  async exportDatev(@Body() dto: DatevExportDto, @Res() res: Response) {
    const csv = await this.invoices.exportDatev(dto.invoiceIds);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="datev-extf.csv"',
    );
    return res.send(csv);
  }

  @Patch(':id/status')
  async patchStatus(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceStatusDto,
  ) {
    return this.invoices.updateStatus(id, dto.status);
  }
}
