import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  sessionId: string;
}

// Pulls the authenticated user (set by JwtStrategy) off the request.
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);