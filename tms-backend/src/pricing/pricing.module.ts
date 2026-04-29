import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingController } from './pricing.controller';
import { SubConditionService } from './sub-condition.service';
import { CustomerTariffService } from './customer-tariff.service';
import { PartnerOnCarriageService } from './partner-on-carriage.service';
import { DailyPriceService } from './daily-price.service';

@Module({
  imports: [PrismaModule],
  controllers: [PricingController],
  providers: [
    SubConditionService,
    CustomerTariffService,
    PartnerOnCarriageService,
    DailyPriceService,
  ],
  exports: [
    SubConditionService,
    CustomerTariffService,
    PartnerOnCarriageService,
    DailyPriceService,
  ],
})
export class PricingModule {}
