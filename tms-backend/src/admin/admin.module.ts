import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BackfillCoordinatesService } from './backfill-coordinates.service';
import { ShipmentsModule } from '../shipments/shipments.module';

@Module({
  imports: [ShipmentsModule],
  controllers: [AdminController],
  providers: [BackfillCoordinatesService],
})
export class AdminModule {}
