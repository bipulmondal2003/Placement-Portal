import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from './constants';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';

/** Marks a route as not requiring authentication. Everything else is authenticated by default. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to the listed roles (enforced server-side by RolesGuard). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  department?: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return (req.ip as string) || req.socket?.remoteAddress || 'unknown';
});
