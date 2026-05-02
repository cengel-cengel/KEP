import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NvStammKundenService } from './nv-stamm-kunden.service';
import { NvStammKundenController } from './nv-stamm-kunden.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NvStammKundenController],
  providers: [NvStammKundenService],
  exports: [NvStammKundenService],
})
export class NvStammKundenModule {}
