import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NvTourenService } from './nv-touren.service';
import { NvTourenController } from './nv-touren.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NvTourenController],
  providers: [NvTourenService],
  exports: [NvTourenService],
})
export class NvTourenModule {}
