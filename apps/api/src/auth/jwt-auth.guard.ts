import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IS_PUBLIC, AuthUser } from '../common/decorators';
import { COOKIE_APP, COOKIE_RECRUITER, Role } from '../common/constants';
import { User, UserDocument } from '../database/schemas/user.schema';

export const AUD_APP = 'app';
export const AUD_RECRUITER = 'recruiter-portal';

/** Recruiter-portal route group: its own session cookie, audience and policy. */
const RECRUITER_ROUTE = /^\/api\/recruiter\//;
/** Session endpoints shared by both portals (log out, who am I, change password). */
const SHARED_SESSION_ROUTE = /^\/api\/auth\/(logout|me|change-password)(\/|\?|$)/;

/**
 * Global authentication guard: every route requires a valid session unless marked @Public().
 *
 * Session policy:
 *  - Recruiter-portal routes (/api/recruiter/*) read ONLY the recruiter cookie, whose token has the
 *    `recruiter-portal` audience and a short lifetime. All other routes read ONLY the app cookie.
 *  - Recruiter accounts are confined to the recruiter route group (plus the shared session endpoints):
 *    a recruiter token is rejected everywhere else, even though it is a valid signed token.
 *  - Non-recruiter accounts can never hold a recruiter-portal token and vice versa (audience check).
 *  - tokenVersion + active flag are re-checked against the database on every request, so logout,
 *    password change and deactivation take effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  private extractToken(req: any): string | undefined {
    const auth = req.headers?.authorization as string | undefined;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    const path: string = (req.originalUrl || req.url || '').split('?')[0];
    const cookies = req.cookies ?? {};
    if (RECRUITER_ROUTE.test(path)) return cookies[COOKIE_RECRUITER];
    if (SHARED_SESSION_ROUTE.test(path)) return cookies[COOKIE_APP] ?? cookies[COOKIE_RECRUITER];
    return cookies[COOKIE_APP];
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest();
    const token = this.extractToken(req);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Authentication required');
    }

    let authUser: AuthUser | undefined;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; v: number; aud: string }>(token);
      const user = await this.users.findById(payload.sub).lean();
      if (!user || !user.active || user.tokenVersion !== payload.v) throw new Error('stale session');

      const isRecruiter = user.role === Role.Recruiter;
      if (isRecruiter && payload.aud !== AUD_RECRUITER) throw new Error('wrong audience');
      if (!isRecruiter && payload.aud !== AUD_APP) throw new Error('wrong audience');

      authUser = { id: String(user._id), email: user.email, name: user.name, role: user.role, department: user.department };
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException('Session is invalid or expired');
    }

    const path: string = (req.originalUrl || req.url || '').split('?')[0];
    if (authUser.role === Role.Recruiter && !RECRUITER_ROUTE.test(path) && !SHARED_SESSION_ROUTE.test(path)) {
      throw new ForbiddenException('Recruiter accounts can only use the recruiter portal');
    }
    req.user = authUser;
    return true;
  }
}
