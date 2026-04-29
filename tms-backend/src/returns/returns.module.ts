import { Module } from '@nestjs/common';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StatusModule } from '../status/status.module';
import { HallModule } from '../hall/hall.module';

@Module({
  imports: [PrismaModule, StatusModule, HallModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}

