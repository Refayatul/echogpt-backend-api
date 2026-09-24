import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

// Records one ApiUsageLog row per finished request. Writing on res 'finish'
// means error responses (401/403/404/429) are logged too, which an
// interceptor's success path would miss. Only method, path, status, duration
// and the userId (when known) are stored — never bodies, tokens or headers.
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();

    response.on('finish', () => {
      // Health checks run often and are not interesting; skip them.
      if (request.originalUrl.startsWith('/api/v1/health')) {
        return;
      }

      // req.user is set by the auth guard, which runs before the response
      // finishes, so it is available here even though it is read late.
      const userId = request.user?.id ?? null;
      const durationMs = Date.now() - startedAt;

      void this.prisma.apiUsageLog
        .create({
          data: {
            userId,
            method: request.method,
            // Store only the path: query strings can contain tokens or secrets.
            path: request.path,
            statusCode: response.statusCode,
            durationMs,
          },
        })
        .catch(() => undefined);
    });

    next();
  }
}