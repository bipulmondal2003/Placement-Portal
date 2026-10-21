import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

/** Consistent error envelope; never leaks stack traces or internals for unexpected errors. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    const extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const phrase = String(HttpStatus[status] ?? 'Error').toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
      error = phrase;
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as Record<string, any>;
        message = b.message ?? exception.message;
        error = b.error ?? phrase;
        // Structured, non-sensitive details that clients are meant to show (e.g. eligibility reasons, AI error code).
        for (const k of ['reasons', 'code', 'retryable']) if (b[k] !== undefined) extra[k] = b[k];
      }
      if (status === HttpStatus.TOO_MANY_REQUESTS) message = 'Too many requests. Please wait a moment and try again.';
    } else if ((exception as any)?.code === 11000) {
      status = HttpStatus.CONFLICT;
      message = 'A record with the same unique value already exists';
      error = 'Conflict';
    } else if ((exception as any)?.name === 'CastError') {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid identifier format';
      error = 'Bad Request';
    } else {
      this.logger.error(`${req.method} ${req.url}`, (exception as Error)?.stack);
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      ...extra,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}

type ArgumentHost = ArgumentsHost;
