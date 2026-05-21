/**
 * R2.1-Fix + R3 Regression-Test: NestJS DI-Bootstrap.
 *
 * Direkt-instanziierte Service-Specs umgehen den Nest-Container —
 * sie fangen DI-Resolution-Fehler NICHT. Das war die Ursache vom
 * R2.1-Outage (forwardRef + emitDecoratorMetadata-Konflikt).
 *
 * Dieser Test compiliert den KOMPLETTEN AppModule via NestJS
 * TestingModule. Jeder Provider wird instanziiert + DI resolved.
 * forwardRef-Brüche, fehlende Imports, zirkuläre Module-Deps, alle
 * werden hier aufgedeckt.
 *
 * Lokal lange Dauer-Tests (≥10s) erwartet — voller Modul-Graph.
 */
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

// Stub ENV vor AppModule-Import (AuthModule validiert JWT_SECRET-Len
// im useFactory). Werte sind nicht funktional — Test prüft DI-Wiring.
process.env.JWT_SECRET =
  'test_jwt_secret_min_32_chars_for_bootstrap_test_only';
process.env.JWT_EXPIRES_IN = '8h';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.CRON_SECRET = 'test_cron_secret_for_bootstrap_test';

import { AppModule } from './app.module';
import { ToursService } from './tours/tours.service';
import { NvTourenService } from './nv-touren/nv-touren.service';
import { WarehousesService } from './warehouses/warehouses.service';
import { CronAuthGuard } from './auth/cron-auth.guard';
import { PrismaService } from './prisma/prisma.service';

describe('AppModule DI Bootstrap (R2.1+R3 Regression)', () => {
  let moduleRef: any;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({
        // Minimal-Stub. compile() prüft DI-Wiring, nicht Prisma-Calls.
        $connect: () => Promise.resolve(),
        $disconnect: () => Promise.resolve(),
      })
      .compile();
  }, 30_000);

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
  });

  it('compile() ohne "Cannot resolve dependencies"', () => {
    expect(moduleRef).toBeDefined();
  });

  it('Tours↔NvTouren forwardRef-Cycle: cross-references korrekt', () => {
    const tours = moduleRef.get(ToursService);
    const nv = moduleRef.get(NvTourenService);
    expect(tours).toBeInstanceOf(ToursService);
    expect(nv).toBeInstanceOf(NvTourenService);
    expect((nv as any).tours).toBe(tours);
    expect((tours as any).nvTouren).toBe(nv);
  });

  it('ToursService kennt WarehousesService (R3-B Wire)', () => {
    const tours = moduleRef.get(ToursService);
    const wh = moduleRef.get(WarehousesService);
    expect((tours as any).warehouses).toBe(wh);
  });

  it('CronAuthGuard ist als Provider registriert (R3-E)', () => {
    const guard = moduleRef.get(CronAuthGuard);
    expect(guard).toBeInstanceOf(CronAuthGuard);
  });
});
