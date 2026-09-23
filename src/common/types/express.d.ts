import { AuthUser } from '../decorators/current-user.decorator';

// passport types Request.user as Express.User. We make Express.User our
// authenticated user shape so request.user is typed everywhere.
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthUser {}
  }
}
