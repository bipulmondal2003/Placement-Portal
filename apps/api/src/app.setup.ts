import { INestApplication, ValidationPipe, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/http-exception.filter';

/** Shared bootstrap (used by main.ts and the e2e tests so tests exercise the real pipeline). */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const allowedOrigins = String(config.get('FRONTEND_URL') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: allowedOrigins, credentials: true });

  // CSRF defence in depth (on top of SameSite cookies): reject state-changing requests whose
  // Origin header is present but not an allowed origin. Non-browser clients send no Origin.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const origin = req.headers.origin;
    if (unsafe && origin && !allowedOrigins.includes(origin)) {
      return next(new ForbiddenException('Origin not allowed'));
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
