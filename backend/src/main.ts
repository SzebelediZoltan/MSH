import './config/env.js';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable('etag');

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
