import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BackfillCoordinatesService } from './backfill-coordinates.service';
import { ShipmentsModule } from '../shipments/shipments.module';
import { NvTourenModule } from '../nv-touren/nv-touren.module';
import { ToursModule } from '../tours/tours.module';

@Module({
  imports: [ShipmentsModule, NvTourenModule, ToursModule],
  controllers: [AdminController],
  providers: [BackfillCoordinatesService],
})
export class AdminModule {}
