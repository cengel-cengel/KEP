import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

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
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  app.use(helmet());

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
    const config = new DocumentBuilder()
      .setTitle('TMS API')
      .setDescription('TMS Backend API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`TMS Backend listening on port ${port}`);
  logger.log(`CORS origins: ${JSON.stringify(resolveCorsOrigins())}`);
  if (enableSwagger) logger.log(`Swagger UI: /docs`);
}
bootstrap();
