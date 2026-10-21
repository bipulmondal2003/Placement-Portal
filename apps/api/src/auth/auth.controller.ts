import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto';
import { AuthUser, ClientIp, CurrentUser, Public } from '../common/decorators';
import { Role } from '../common/constants';

// Read at import time (after ConfigModule has loaded .env in main.ts / tests set it before importing the app).
const envLimit = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const LOGIN_LIMIT = { default: { limit: envLimit('LOGIN_THROTTLE_LIMIT', 10), ttl: 60_000 } };
const RECRUITER_LOGIN_LIMIT = { default: { limit: envLimit('RECRUITER_LOGIN_THROTTLE_LIMIT', 5), ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('register')
  register(@Body() dto: RegisterDto, @ClientIp() ip: string) {
    return this.auth.register(dto, ip);
  }

  @Public()
  @Throttle(LOGIN_LIMIT)
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    const { token, maxAgeMs, user } = await this.auth.login(dto, 'app', ip);
    this.auth.setSessionCookie(res, 'app', token, maxAgeMs);
    return { user };
  }

  /** Recruiter portal login: separate cookie, shorter lifetime, stricter throttling. */
  @Public()
  @Throttle(RECRUITER_LOGIN_LIMIT)
  @HttpCode(200)
  @Post('recruiter/login')
  async recruiterLogin(@Body() dto: LoginDto, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    const { token, maxAgeMs, user } = await this.auth.login(dto, 'recruiter', ip);
    this.auth.setSessionCookie(res, 'recruiter', token, maxAgeMs);
    return { user };
  }

  @HttpCode(200)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @ClientIp() ip: string, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user, ip);
    this.auth.clearSessionCookie(res, user.role === Role.Recruiter ? 'recruiter' : 'app');
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @HttpCode(200)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user, dto, ip);
    this.auth.clearSessionCookie(res, user.role === Role.Recruiter ? 'recruiter' : 'app');
    return { ok: true, message: 'Password changed. Please sign in again.' };
  }
}
