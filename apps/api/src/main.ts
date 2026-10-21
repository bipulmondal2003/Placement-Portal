import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const swagger = new DocumentBuilder()
    .setTitle('Placement Skill Matcher & Readiness Analyser API')
    .setDescription('Evidence-based placement readiness and skill-gap platform. Auth uses httpOnly cookies.')
    .setVersion('1.0')
    .addCookieAuth('prp_session')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT')!;
  app.enableShutdownHooks();
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}/api  (docs: /api/docs)`);
}

bootstrap().catch((err) => {
  // Env validation errors land here with a readable message.
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
