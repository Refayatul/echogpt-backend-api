import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

// Runs after JwtAuthGuard. Allows the request only when the user's role is one
// of those required by @Roles() on the route.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user || !requiredRoles.includes(user.role as RoleName)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
