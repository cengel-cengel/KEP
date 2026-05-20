import { Module } from '@nestjs/common';
import { ToursService } from './tours.service';
import { ToursController } from './tours.controller';
import { DocumentsModule } from '../documents/documents.module';
import { StatusModule } from '../status/status.module';
import { NvTourenModule } from '../nv-touren/nv-touren.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  controllers: [ToursController],
  providers: [ToursService],
  imports: [DocumentsModule, StatusModule, NvTourenModule, RealtimeModule],
  exports: [ToursService],
})
export class ToursModule {}
