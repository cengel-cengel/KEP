import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StatusModule } from '../status/status.module';
import { ReturnsModule } from '../returns/returns.module';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { DriverAuthGuard } from './driver-auth.guard';

@Module({
  imports: [AuthModule, PrismaModule, StatusModule, ReturnsModule],
  controllers: [DriverController],
  providers: [DriverService, DriverAuthGuard],
  exports: [DriverService],
})
export class DriverModule {}
