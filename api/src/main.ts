import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // The web app proxies /api to this server; trust its X-Forwarded-For so
  // audit entries record the real client IP.
  app.set('trust proxy', 'loopback');
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
