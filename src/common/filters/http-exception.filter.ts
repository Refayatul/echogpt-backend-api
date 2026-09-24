import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Normalises every error response into one shape so clients can rely on it.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.getMessage(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Log unexpected failures with the stack, but never log request bodies.
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      error: this.getErrorName(status),
      message,
      // Only the path is returned: a query string may contain a token.
      path: request.path,
      timestamp: new Date().toISOString(),
    });
  }

  private getMessage(exception: unknown): string | string[] {
    const message = this.rawMessage(exception);
    // Nest's built-in 404 message embeds the full URL, so strip any query
    // string from it: it can carry a token.
    if (typeof message === 'string') {
      return message.split('?')[0];
    }
    return message;
  }

  private rawMessage(exception: unknown): string | string[] {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return res;
      }
      const payload = res as { message?: string | string[] };
      return payload.message ?? exception.message;
    }
    if (exception instanceof Error) {
      return exception.message;
    }
    return 'Internal server error';
  }

  private getErrorName(status: number): string {
    const name = HttpStatus[status];
    return typeof name === 'string' ? name : 'Error';
  }
}