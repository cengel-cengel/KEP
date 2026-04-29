import { Module } from '@nestjs/common';
import { ToursService } from './tours.service';
import { ToursController } from './tours.controller';
import { DocumentsModule } from '../documents/documents.module';
import { StatusModule } from '../status/status.module';

@Module({
  controllers: [ToursController],
  providers: [ToursService],
  imports: [DocumentsModule, StatusModule],
  exports: [ToursService],
})
export class ToursModule {}
