import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatusService } from './status.service';
import { LockService } from './lock.service';
import { AdvisoryService } from './advisory.service';
import { CreateStatusEventDto } from './dto/create-status-event.dto';
import { CreateLockDto } from './dto/create-lock.dto';
import { ResolveLockDto } from './dto/resolve-lock.dto';
import { CreateAdvisoryDto } from './dto/create-advisory.dto';
import { ConfirmAdvisoryDto } from './dto/confirm-advisory.dto';
import { PatchAdvisoryStatusDto } from './dto/patch-advisory-status.dto';
import { EscalateLockDto } from './dto/escalate-lock.dto';

@ApiTags('status')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('status')
export class StatusController {
  constructor(
    private readonly status: StatusService,
    private readonly locks: LockService,
    private readonly advisories: AdvisoryService,
  ) {}

  @Get('badge-summary')
  getBadgeSummary() {
    return this.status.getBadgeSummary();
  }

  @Get('workstack/:type')
  getWorkstack(@Param('type') type: string) {
    return this.status.getWorkstack(type);
  }

  @Post('events')
  async addEvent(@Body() dto: CreateStatusEventDto, @Req() req: { user: { userId: string } }) {
    await this.status.addEvent(dto.shipmentId, dto.eventType, {
      userId: req.user.userId,
      description: dto.description,
      location: dto.location,
      recipientName: dto.recipientName,
      signatureData: dto.signatureData,
      photoUrl: dto.photoUrl,
      isAutomatic: dto.isAutomatic,
    });
    return { ok: true };
  }

  @Get('shipment/:id/history')
  getHistory(@Param('id') id: string) {
    return this.status.getHistory(id);
  }

  @Post('locks')
  createLock(@Body() dto: CreateLockDto, @Req() req: { user: { userId: string } }) {
    return this.locks.lockShipment(
      dto.shipmentId,
      dto.lockType,
      dto.reason,
      req.user.userId,
      dto.dueDate ? new Date(dto.dueDate) : undefined,
    );
  }

  @Patch('locks/:id/resolve')
  resolveLock(
    @Param('id') id: string,
    @Body() dto: ResolveLockDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.locks.unlockShipment(id, dto.resolutionNotes, req.user.userId);
  }

  @Patch('locks/:id/escalate')
  escalateLock(@Param('id') id: string, @Body() dto: EscalateLockDto) {
    return this.locks.escalateLock(id, dto.escalatedTo);
  }

  @Get('locks')
  @ApiQuery({ name: 'activeOnly', required: false })
  @ApiQuery({ name: 'lockType', required: false })
  listLocks(
    @Query('activeOnly') activeOnly?: string,
    @Query('lockType') lockType?: string,
  ) {
    return this.locks.findAllLocks({
      activeOnly: activeOnly === 'true' || activeOnly === '1',
      lockType: lockType || undefined,
    });
  }

  @Get('locks/overdue')
  overdueLocks() {
    return this.locks.getOverdueLocks();
  }

  @Get('locks/shipment/:shipmentId/active')
  activeLocksForShipment(@Param('shipmentId') shipmentId: string) {
    return this.locks.getActiveLocks(shipmentId);
  }

  @Get('locks/workstack')
  @ApiQuery({ name: 'lockType', required: false })
  lockWorkstack(@Query('lockType') lockType?: string) {
    return this.locks.getLockWorkstack(lockType || undefined);
  }

  @Post('advisories')
  createAdvisory(
    @Body() dto: CreateAdvisoryDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.advisories.createAdvisory(
      dto.shipmentId,
      {
        advisoryType: dto.advisoryType,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        portalUrl: dto.portalUrl,
        portalBookingRef: dto.portalBookingRef,
        notes: dto.notes,
      },
      req.user.userId,
    );
  }

  @Patch('advisories/:id/confirm')
  confirmAdvisory(@Param('id') id: string, @Body() dto: ConfirmAdvisoryDto) {
    return this.advisories.confirmAdvisory(
      id,
      dto.scheduledDate,
      dto.timeFrom,
      dto.timeTo,
    );
  }

  @Patch('advisories/:id/status')
  patchAdvisoryStatus(@Param('id') id: string, @Body() dto: PatchAdvisoryStatusDto) {
    return this.advisories.patchStatus(id, dto.status);
  }

  @Post('advisories/:id/send-email')
  sendAdvisoryEmail(@Param('id') id: string) {
    return this.advisories.sendAdvisoryEmailPlaceholder(id);
  }

  @Get('advisories/workstack')
  advisoryWorkstack() {
    return this.advisories.getAdvisoryWorkstack();
  }
}
