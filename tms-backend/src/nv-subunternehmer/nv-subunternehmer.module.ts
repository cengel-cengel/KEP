import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NvSubunternehmerService } from './nv-subunternehmer.service';
import { NvSubunternehmerController } from './nv-subunternehmer.controller';

@Module({
  imports: [PrismaModule],
  controllers: [NvSubunternehmerController],
  providers: [NvSubunternehmerService],
  exports: [NvSubunternehmerService],
})
export class NvSubunternehmerModule {}
