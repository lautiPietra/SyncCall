import type { UserDocument } from '../features/users/users.types';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extiende Express.User (usado por Passport) con nuestros campos, en vez de redeclarar Request.user
    interface User extends UserDocument {}
  }
}

export {};
