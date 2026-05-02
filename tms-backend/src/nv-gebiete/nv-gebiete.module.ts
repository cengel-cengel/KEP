import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NvGebieteService } from './nv-gebiete.service';
import { NvGebieteController } from './nv-gebiete.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NvGebieteController],
  providers: [NvGebieteService],
  exports: [NvGebieteService],
})
export class NvGebieteModule {}
