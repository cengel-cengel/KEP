import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NvTourenService } from './nv-touren.service';
import { NvTourenController } from './nv-touren.controller';
import { ToursModule } from '../tours/tours.module';

@Module({
  // R2.1: forwardRef bricht zyklische Module-Dep
  // (NvTouren → Tours für consolidateOrCreateFvTour-Hook bei
  // completeStopShipment; Tours → NvTouren existiert weiterhin
  // für executeShipmentSplit).
  imports: [PrismaModule, forwardRef(() => ToursModule)],
  controllers: [NvTourenController],
  providers: [NvTourenService],
  exports: [NvTourenService],
})
export class NvTourenModule {}
