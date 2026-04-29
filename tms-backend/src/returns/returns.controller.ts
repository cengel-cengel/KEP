import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReturnsService } from './returns.service';
import { CreateNvDispositionDto } from './dto/create-nv-disposition.dto';
import { ResolveNvDispositionDto } from './dto/resolve-nv-disposition.dto';
import { CreateDamageReportDto } from './dto/create-damage-report.dto';
import { ResolveDamageReportDto } from './dto/resolve-damage-report.dto';
import { CreateClaimDto } from './dto/create-claim.dto';
import { CreateSurplusItemDto } from './dto/create-surplus-item.dto';
import { MatchSurplusItemDto } from './dto/match-surplus-item.dto';
import { AssignReturnTourDto } from './dto/assign-return-tour.dto';
import { SetSurplusStatusDto } from './dto/set-surplus-status.dto';

@ApiTags('returns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  // ── NV-Verfügungen ─────────────────────────────────────
  @Get('workstack/nv')
  getWorkstackNvDispositions() {
    return this.returns.getWorkstackNvDispositions();
  }

  @Post('nv')
  createNvDisposition(
    @Body() dto: CreateNvDispositionDto,
    @Request() req: any,
  ) {
    return this.returns.createNvDisposition(dto.shipmentId, dto, req.user.userId);
  }

  @Patch('nv/:id/resolve')
  resolveNvDisposition(
    @Param('id') id: string,
    @Body() dto: ResolveNvDispositionDto,
    @Request() req: any,
  ) {
    return this.returns.resolveNvDisposition(id, dto, req.user.userId);
  }

  // ── Beschädigungen ─────────────────────────────────────
  @Get('workstack/damages')
  getWorkstackDamages() {
    return this.returns.getWorkstackDamages();
  }

  @Post('damages')
  createDamageReport(
    @Body() dto: CreateDamageReportDto,
    @Request() req: any,
  ) {
    return this.returns.createDamageReport(dto.shipmentId, dto, req.user.userId);
  }

  @Patch('damages/:id/resolve')
  resolveDamageReport(
    @Param('id') id: string,
    @Body() dto: ResolveDamageReportDto,
    @Request() req: any,
  ) {
    return this.returns.resolveDamageReport(id, dto, req.user.userId);
  }

  // ── Claims ─────────────────────────────────────────────
  @Post('claims')
  createClaim(@Body() dto: CreateClaimDto, @Request() req: any) {
    return this.returns.createClaim(dto.shipmentId, dto, req.user.userId);
  }

  // ── Retouren ───────────────────────────────────────────
  @Get('workstack/returns')
  getWorkstackReturns() {
    return this.returns.getWorkstackReturns();
  }

  // ── Überzähligkeiten (ÜZ) ─────────────────────────────
  @Get('workstack/surplus')
  getWorkstackSurplus() {
    return this.returns.getWorkstackSurplus();
  }

  @Post('surplus')
  createSurplus(@Body() dto: CreateSurplusItemDto, @Request() req: any) {
    return this.returns.createSurplusItem(dto.tourId, dto, req.user.userId);
  }

  @Patch('surplus/:id/match')
  matchSurplus(
    @Param('id') id: string,
    @Body() dto: MatchSurplusItemDto,
    @Request() req: any,
  ) {
    return this.returns.matchSurplusItem(id, dto.shipmentId, req.user.userId);
  }

  @Patch('returns/:id/assign-tour')
  assignReturnTour(
    @Param('id') id: string,
    @Body() dto: AssignReturnTourDto,
    @Request() req: any,
  ) {
    return this.returns.assignReturnTour(id, dto.tourId, req.user.userId);
  }

  @Patch('returns/:id/mark-delivered')
  markReturnDelivered(@Param('id') id: string, @Request() req: any) {
    return this.returns.markReturnDelivered(id, req.user.userId);
  }

  @Patch('surplus/:id/status')
  setSurplusStatus(
    @Param('id') id: string,
    @Body() dto: SetSurplusStatusDto,
    @Request() req: any,
  ) {
    return this.returns.setSurplusStatus(id, dto.status, req.user.userId);
  }
}

