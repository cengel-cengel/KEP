import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { CronController } from './cron.controller';
import { BackfillCoordinatesService } from './backfill-coordinates.service';
import { RecomputeService } from './recompute.service';
import { RecomputeSchedulerService } from './recompute-scheduler.service';
import { ShipmentsModule } from '../shipments/shipments.module';
import { NvTourenModule } from '../nv-touren/nv-touren.module';
import { ToursModule } from '../tours/tours.module';
import { CronAuthGuard } from '../auth/cron-auth.guard';

@Module({
  imports: [ShipmentsModule, NvTourenModule, ToursModule],
  // R3-E: CronController (NUR CronAuthGuard) + AdminController (JWT)
  // sind getrennt — keine Auth-Mischung.
  controllers: [AdminController, CronController],
  // R3+ Nightly-Recompute:
  //   RecomputeService = DRY-Loop (Admin + Cron + Scheduler nutzen sie).
  //   RecomputeSchedulerService = @Cron('0 2 * * *', Europe/Berlin).
  // ScheduleModule.forRoot() wird im AppModule registriert.
  providers: [
    BackfillCoordinatesService,
    CronAuthGuard,
    RecomputeService,
    RecomputeSchedulerService,
  ],
})
export class AdminModule {}
