// ============================================================
// TMS Backend – App Module (Hauptmodul)
// src/app.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { AddressesModule } from './addresses/addresses.module';
import { SubcontractorsModule } from './subcontractors/subcontractors.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { AdminModule } from './admin/admin.module';
import { ToursModule } from './tours/tours.module';
import { ConditionsModule } from './conditions/conditions.module';
import { InvoicesModule } from './invoices/invoices.module';
import { DocumentsModule } from './documents/documents.module';
import { CockpitModule } from './cockpit/cockpit.module';
import { AuditModule } from './audit/audit.module';
import { PrismaModule } from './prisma/prisma.module';
import { HallModule } from './hall/hall.module';
import { MasterDataModule } from './masterdata/masterdata.module';
import { RelationsModule } from './relations/relations.module';
import { CostsModule } from './costs/costs.module';
import { UserPreferencesModule } from './user-preferences/user-preferences.module';
import { RoutingModule } from './routing/routing.module';
import { LoadingModule } from './loading/loading.module';
import { StatusModule } from './status/status.module';
import { PricingModule } from './pricing/pricing.module';
import { DriverModule } from './driver/driver.module';
import { ReturnsModule } from './returns/returns.module';
import { PricingHubModule } from './pricing-hub/pricing-hub.module';
import { NvGebieteModule } from './nv-gebiete/nv-gebiete.module';
import { NvSubunternehmerModule } from './nv-subunternehmer/nv-subunternehmer.module';

@Module({
  imports: [
    // Config – lädt .env Datei
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate Limiting – Schutz vor API-Missbrauch
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get('THROTTLE_TTL', 60),
          limit: config.get('THROTTLE_LIMIT', 100),
        },
      ],
      inject: [ConfigService],
    }),

    // Bull Queue – temporaer deaktiviert fuer Phase-1-Deploy.
    // Verursachte vermutlich haengenden Bootstrap (Redis-Connect blockiert
    // app.listen() in Railways Container). Wieder reinnehmen sobald
    // Redis-Connection bestaetigt ist.
    // BullModule.forRootAsync({
    //   imports: [ConfigModule],
    //   useFactory: (config: ConfigService) => ({
    //     redis: {
    //       host: config.get('REDIS_HOST', 'localhost'),
    //       port: config.get('REDIS_PORT', 6379),
    //       password: config.get('REDIS_PASSWORD'),
    //     },
    //   }),
    //   inject: [ConfigService],
    // }),

    // Datenbank (Prisma ORM)
    PrismaModule,

    // Feature Module
    AuthModule,
    UsersModule,
    CustomersModule,
    AddressesModule,
    SubcontractorsModule,
    ConditionsModule,
    ShipmentsModule,
    AdminModule,
    ToursModule,
    InvoicesModule,
    DocumentsModule,
    HallModule,
    CockpitModule,
    AuditModule,
    MasterDataModule,
    RelationsModule,
    CostsModule,
    UserPreferencesModule,
    RoutingModule,
    LoadingModule,
    StatusModule,
    PricingModule,
    DriverModule,
    ReturnsModule,
    PricingHubModule,
    NvGebieteModule,
    NvSubunternehmerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
