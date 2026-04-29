import { Module } from '@nestjs/common';
import { PricingHubController } from './pricing-hub.controller';
import { PricingHubService } from './pricing-hub.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CostsModule } from '../costs/costs.module';

@Module({
  imports: [PrismaModule, CostsModule],
  controllers: [PricingHubController],
  providers: [PricingHubService],
  exports: [PricingHubService],
})
export class PricingHubModule {}

