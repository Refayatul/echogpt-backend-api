import { SetMetadata } from '@nestjs/common';
import { RoleName } from '@prisma/client';

export const ROLES_KEY = 'roles';

// Restricts a route to the given roles. RolesGuard reads this metadata.
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);