import { Module } from '@nestjs/common';
import { HallController } from './hall.controller';
import { HallService } from './hall.service';
import { StatusModule } from '../status/status.module';

@Module({
  imports: [StatusModule],
  controllers: [HallController],
  providers: [HallService],
  exports: [HallService],
})
export class HallModule {}
