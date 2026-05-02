import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NvStammTourenService } from './nv-stamm-touren.service';
import { NvStammTourenController } from './nv-stamm-touren.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NvStammTourenController],
  providers: [NvStammTourenService],
  exports: [NvStammTourenService],
})
export class NvStammTourenModule {}
