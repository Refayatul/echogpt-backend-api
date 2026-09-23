import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';

// Writes one ApiUsageLog row per request. Only method, path, status, duration
// and the userId (when known) are stored — never bodies, tokens or headers.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => this.save(request, response.statusCode, startedAt),
        error: () => this.save(request, response.statusCode, startedAt),
      }),
    );
  }

  private save(request: Request, statusCode: number, startedAt: number): void {
    const user = request.user as AuthUser | undefined;
    const durationMs = Date.now() - startedAt;
    const path = request.originalUrl;

    // Fire and forget: logging must never break the actual response.
    void this.prisma.apiUsageLog
      .create({
        data: {
          userId: user?.id ?? null,
          method: request.method,
          path,
          statusCode,
          durationMs,
        },
      })
      .catch(() => undefined);
  }
}