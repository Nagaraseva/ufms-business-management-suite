import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  const config = new DocumentBuilder()
    .setTitle('UFMS Business Management Suite API')
    .setDescription(
      'Multi-tenant business management REST API.\n\n' +
      'Auth: POST /api/v1/auth/login → Bearer token (SHA-256,HttpOnly cookie).\n' +
      'All tenant-scoped routes require a session; access is enforced by explicit permission codes and PostgreSQL Row Level Security.\n' +
      'Versioning: /api/v1/* (frozen); future breaking changes under /api/v2.\n' +
      'Platform: /api/v1/platform/* requires platform_admin.\n' +
      'Worker: /api/v1/queue/jobs exposes job status for the in-process queue (swap to Redis in production).\n' +
      'Storage: /api/v1/storage/* uses object-storage adapter (S3/GCS/Azure) with signed URLs; console provider is metadata-only (Rule 4).',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'opaque' }, 'bearer')
    .addTag('Auth')
    .addTag('Platform')
    .addTag('Marketing')
    .addTag('Reports')
    .addTag('AI Assistant')
    .addTag('Creative Studio')
    .addTag('Finance')
    .addTag('Worker Queue')
    .addTag('Storage')
    .build();
  const doc = SwaggerModule.createDocument(app, config, { ignoreGlobalPrefix: false });
  SwaggerModule.setup('api/docs', app, doc);
  // JSON export for CI / SDK generation
  const { writeFileSync, mkdirSync } = await import('node:fs');
  try { mkdirSync('docs', { recursive: true }); writeFileSync('docs/openapi.json', JSON.stringify(doc, null, 2)); } catch {}

  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`UFMS API listening on http://0.0.0.0:${port}  (docs at /api/docs)`, 'Bootstrap');
}
bootstrap();
