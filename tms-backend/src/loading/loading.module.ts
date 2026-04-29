import { Module } from '@nestjs/common';
import { LoadingController } from './loading.controller';
import { LoadingService } from './loading.service';
import { LoadingOptimizerService } from './loading-optimizer.service';

@Module({
  controllers: [LoadingController],
  providers: [LoadingService, LoadingOptimizerService],
  exports: [LoadingService, LoadingOptimizerService],
})
export class LoadingModule {}

