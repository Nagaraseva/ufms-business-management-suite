import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Central exception filter.
 * Rule: never leak internal database errors or stack traces to customers.
 * Known HttpExceptions pass through with their message and a stable code;
 * anything else becomes a generic 500 with a correlation id for support.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId = (req as any).correlationId ?? 'n/a';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as any;
      const message = typeof body === 'string' ? body : body?.message ?? exception.message;
      res.status(status).json({
        error: {
          code: typeof body === 'object' && body?.code ? body.code : HttpStatus[status] ?? 'ERROR',
          message: Array.isArray(message) ? message.join('; ') : message,
          details: typeof body === 'object' && body?.details ? body.details : undefined,
        },
        correlationId,
      });
      return;
    }

    // Unknown error: log fully server-side, return nothing internal.
    this.logger.error(
      `Unhandled error on ${req.method} ${req.url} [${correlationId}]`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Quote the reference below to support.',
      },
      correlationId,
    });
  }
}
