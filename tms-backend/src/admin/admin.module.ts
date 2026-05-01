import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { BackfillCoordinatesService } from './backfill-coordinates.service';

@Module({
  controllers: [AdminController],
  providers: [BackfillCoordinatesService],
})
export class AdminModule {}
