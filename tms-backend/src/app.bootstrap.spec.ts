/**
 * R2.1-Fix Regression-Test: NestJS DI-Bootstrap-Test.
 *
 * Direkt-instanziierte Service-Specs fangen DI-Resolution-Fehler
 * NICHT — sie umgehen den Nest-Container. forwardRef-Probleme +
 * Decorator-Metadata-Issues kommen erst beim Test.createTestingModule
 * (.compile()) zum Tragen.
 *
 * Dieser Test verifiziert dass die zyklische Tours↔NvTouren-
 * Dependency sauber resolved.
 */
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ToursModule } from './tours/tours.module';
import { NvTourenModule } from './nv-touren/nv-touren.module';
import { ToursService } from './tours/tours.service';
import { NvTourenService } from './nv-touren/nv-touren.service';
import { PrismaService } from './prisma/prisma.service';

describe('App DI Bootstrap (R2.1-Fix Regression)', () => {
  it('Tours↔NvTouren forwardRef-Cycle resolved sauber (kein "Cannot resolve dependencies")', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ToursModule,
        NvTourenModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    const tours = moduleRef.get(ToursService);
    const nv = moduleRef.get(NvTourenService);
    expect(tours).toBeInstanceOf(ToursService);
    expect(nv).toBeInstanceOf(NvTourenService);
    // Cross-Resolution: nv.tours hält ToursService, tours.nvTouren
    // hält NvTourenService — forwardRef proxy resolved zur Runtime
    // korrekt.
    expect((nv as any).tours).toBe(tours);
    expect((tours as any).nvTouren).toBe(nv);

    await moduleRef.close();
  });
});
