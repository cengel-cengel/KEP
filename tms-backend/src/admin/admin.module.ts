import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { CronController } from './cron.controller';
import { BackfillCoordinatesService } from './backfill-coordinates.service';
import { ShipmentsModule } from '../shipments/shipments.module';
import { NvTourenModule } from '../nv-touren/nv-touren.module';
import { ToursModule } from '../tours/tours.module';
import { CronAuthGuard } from '../auth/cron-auth.guard';

@Module({
  imports: [ShipmentsModule, NvTourenModule, ToursModule],
  // R3-E: CronController (NUR CronAuthGuard) + AdminController (JWT)
  // sind getrennt — keine Auth-Mischung.
  controllers: [AdminController, CronController],
  providers: [BackfillCoordinatesService, CronAuthGuard],
})
export class AdminModule {}
