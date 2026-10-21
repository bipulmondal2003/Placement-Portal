import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC, ROLES_KEY } from '../common/decorators';
import { Role } from '../common/constants';

/**
 * Global RBAC guard. A route without @Roles() is open to any authenticated user,
 * a route with @Roles(...) is limited to those roles. Runs after JwtAuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest();
    if (!req.user) {
      if (isPublic) return true;
      throw new ForbiddenException('Not permitted');
    }
    if (!required.includes(req.user.role)) throw new ForbiddenException('You do not have permission to perform this action');
    return true;
  }
}
