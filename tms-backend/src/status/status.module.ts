import { Module } from '@nestjs/common';
import { StatusService } from './status.service';
import { LockService } from './lock.service';
import { AdvisoryService } from './advisory.service';
import { StatusController } from './status.controller';

@Module({
  controllers: [StatusController],
  providers: [StatusService, LockService, AdvisoryService],
  exports: [StatusService, LockService, AdvisoryService],
})
export class StatusModule {}
