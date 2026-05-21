import { Module, forwardRef } from '@nestjs/common';
import { ToursService } from './tours.service';
import { ToursController } from './tours.controller';
import { DocumentsModule } from '../documents/documents.module';
import { StatusModule } from '../status/status.module';
import { NvTourenModule } from '../nv-touren/nv-touren.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CostsModule } from '../costs/costs.module';
import { WarehousesModule } from '../warehouses/warehouses.module';

@Module({
  controllers: [ToursController],
  providers: [ToursService],
  // R2.1: NvTourenModule via forwardRef (zyklisch, siehe
  // nv-touren.module.ts-Kommentar).
  // R2.2: CostsModule für HAUPTLAUF-Kosten via
  // calculateMainCarriageCost.
  // R3-B: WarehousesModule für Umschlag-WH-Auto-Hub-Set bei
  // consolidateOrCreateFvTour.
  imports: [
    DocumentsModule,
    StatusModule,
    forwardRef(() => NvTourenModule),
    RealtimeModule,
    CostsModule,
    WarehousesModule,
  ],
  exports: [ToursService],
})
export class ToursModule {}
