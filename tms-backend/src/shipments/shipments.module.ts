import { Module } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { ConditionsModule } from '../conditions/conditions.module';
import { AuditModule } from '../audit/audit.module';
import { HallModule } from '../hall/hall.module';
import { RelationsModule } from '../relations/relations.module';
import { RoutingModule } from '../routing/routing.module';
import { StatusModule } from '../status/status.module';
import { CostsModule } from '../costs/costs.module';
import { PricingHubModule } from '../pricing-hub/pricing-hub.module';

@Module({
  imports: [
    ConditionsModule,
    AuditModule,
    HallModule,
    RelationsModule,
    RoutingModule,
    StatusModule,
    CostsModule,
    PricingHubModule,
  ],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
