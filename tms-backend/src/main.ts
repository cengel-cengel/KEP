import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

// SOFORT-Heartbeat - feuert auch wenn Nest haengt.
// So sehen wir definitiv ob der Container lebt.
console.log(`[BOOT] process started, pid=${process.pid}, time=${new Date().toISOString()}`);
const earlyHeartbeat = setInterval(() => {
  console.log(`[ALIVE] ${new Date().toISOString()}`);
}, 5000);
process.on('exit', (code) => {
  clearInterval(earlyHeartbeat);
  console.log(`[BOOT] process exiting with code=${code}`);
});
process.on('uncaughtException', (err) => {
  console.error('[BOOT] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[BOOT] unhandledRejection:', reason);
});

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
];

function resolveCorsOrigins(): (string | RegExp)[] {
  const envValue = process.env.FRONTEND_URL?.trim();
  if (!envValue) {
    if (process.env.NODE_ENV === 'production') {
      // In Production darf das Backend NICHT default alle Origins
      // akzeptieren. FRONTEND_URL muss gesetzt sein - sonst Fail-fast.
      throw new Error(
        'FRONTEND_URL muss in Production gesetzt sein (CSV mehrerer Origins moeglich).',
      );
    }
    return DEFAULT_DEV_ORIGINS;
  }
  // Komma-separiert: erlaubt mehrere Frontends (Vercel + Railway)
  return envValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function bootstrap() {
  console.log('[STARTUP] creating Nest app...');
  const app = await NestFactory.create(AppModule);
  console.log('[STARTUP] Nest app created');

  app.setGlobalPrefix('api');
  app.use(helmet());

  console.log('[STARTUP] resolving CORS origins...');
  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Swagger: per Default an, in Production NUR mit ENABLE_SWAGGER=true.
  // So bleibt /docs in der GF-Demo-Phase verfügbar, in echter Production
  // kann es deaktiviert werden.
  const enableSwagger =
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true';

  if (enableSwagger) {
    console.log('[STARTUP] building Swagger document...');
    const config = new DocumentBuilder()
      .setTitle('TMS API')
      .setDescription('TMS Backend API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    console.log('[STARTUP] Swagger ready');
  }

  const port = Number(process.env.PORT ?? 3001);
  console.log(`[STARTUP] about to listen on 0.0.0.0:${port}`);
  console.log(`[STARTUP] env PORT raw=${JSON.stringify(process.env.PORT)}`);

  // Heartbeat VOR listen() - sehen ob Process ueberlebt selbst wenn
  // listen haengt
  const heartbeat = setInterval(() => {
    console.log(`[ALIVE] tick ${new Date().toISOString()} pid=${process.pid}`);
  }, 5000);

  // Hard-Timeout: wenn listen nach 30s nicht resolved, abbrechen mit Log
  const listenWithTimeout = Promise.race([
    app.listen(port, '0.0.0.0'),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('app.listen() hat 30s nicht resolved')), 30000),
    ),
  ]);

  try {
    await listenWithTimeout;
    console.log(`[STARTUP] *** LISTEN RESOLVED *** port=${port}`);
  } catch (err) {
    console.error('[STARTUP] *** LISTEN FAILED ***', err);
    clearInterval(heartbeat);
    process.exit(1);
  }

  const logger = new Logger('Bootstrap');
  logger.log(`TMS Backend listening on port ${port}`);
  logger.log(`CORS origins: ${JSON.stringify(resolveCorsOrigins())}`);
  if (enableSwagger) logger.log(`Swagger UI: /docs`);
}

bootstrap().catch((err) => {
  console.error('[STARTUP] bootstrap failed:', err);
  process.exit(1);
});
