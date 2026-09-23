import { AuthUser } from '../decorators/current-user.decorator';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
