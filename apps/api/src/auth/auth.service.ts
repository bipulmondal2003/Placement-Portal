import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { Model } from 'mongoose';
import { Response } from 'express';
import { User, UserDocument, StudentProfile, StudentProfileDocument } from '../database/schemas/user.schema';
import { SkillProfile, SkillProfileDocument } from '../database/schemas/readiness.schema';
import { COOKIE_APP, COOKIE_RECRUITER, Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { AuditService } from '../audit/audit.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { AUD_APP, AUD_RECRUITER } from './jwt-auth.guard';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto';

/** Parses "30m", "8h", "7d", "3600" into milliseconds. */
export function durationToMs(s: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(s.trim());
  if (!m) return 8 * 3600_000;
  const n = Number(m[1]);
  const unit = m[2] ?? 's';
  return n * { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
}

@Injectable()
export class AuthService {
  /** Used to equalise timing when the account does not exist (avoids user enumeration by latency). */
  private dummyHash?: string;

  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(SkillProfile.name) private readonly skillProfiles: Model<SkillProfileDocument>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly sysConfig: SystemConfigService,
  ) {}

  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async register(dto: RegisterDto, ip?: string) {
    const cfg = await this.sysConfig.get();
    if (!cfg.registrationOpenForStudents) throw new ForbiddenException('Self-registration is currently disabled');

    const email = dto.email.toLowerCase().trim();
    if (await this.users.exists({ email })) throw new ConflictException('An account with this email already exists');

    // Public registration can ONLY ever create students. Other roles are provisioned by administrators.
    const user = await this.users.create({
      email,
      name: dto.name.trim(),
      role: Role.Student,
      department: dto.department,
      passwordHash: await this.hash(dto.password),
    });
    await this.profiles.create({
      user: user._id,
      department: dto.department,
      graduationYear: dto.graduationYear,
      rollNumber: dto.rollNumber,
    });
    await this.skillProfiles.create({ student: user._id, skills: [] });
    await this.audit.log('auth.register', { id: String(user._id), role: Role.Student }, 'User', String(user._id), {}, ip);
    return this.toPublic(user);
  }

  /** portal=app for students/staff, portal=recruiter for the recruiter portal (separate session policy). */
  async login(dto: LoginDto, portal: 'app' | 'recruiter', ip?: string) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.users.findOne({ email }).select('+passwordHash');
    let valid = false;
    if (user) {
      valid = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    } else {
      this.dummyHash ??= await this.hash('dummy-password-for-timing-1');
      await argon2.verify(this.dummyHash, dto.password).catch(() => false);
    }

    const roleMatchesPortal = user ? (portal === 'recruiter') === (user.role === Role.Recruiter) : false;
    if (!user || !valid || !user.active || !roleMatchesPortal) {
      await this.audit.log('auth.login_failed', null, 'User', user ? String(user._id) : undefined, { email, portal }, ip);
      throw new UnauthorizedException('Invalid email or password');
    }

    user.lastLoginAt = new Date();
    await user.save();
    const expiresIn = this.config.get<string>(portal === 'recruiter' ? 'RECRUITER_JWT_EXPIRES_IN' : 'JWT_EXPIRES_IN')!;
    const token = await this.jwt.signAsync(
      { sub: String(user._id), v: user.tokenVersion, aud: portal === 'recruiter' ? AUD_RECRUITER : AUD_APP },
      { expiresIn: Math.floor(durationToMs(expiresIn) / 1000) },
    );
    await this.audit.log('auth.login', { id: String(user._id), role: user.role }, 'User', String(user._id), { portal }, ip);
    return { token, maxAgeMs: durationToMs(expiresIn), user: this.toPublic(user) };
  }

  setSessionCookie(res: Response, portal: 'app' | 'recruiter', token: string, maxAgeMs: number) {
    res.cookie(portal === 'recruiter' ? COOKIE_RECRUITER : COOKIE_APP, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: portal === 'recruiter' ? 'strict' : 'lax',
      maxAge: maxAgeMs,
      path: '/',
    });
  }

  clearSessionCookie(res: Response, portal: 'app' | 'recruiter') {
    res.clearCookie(portal === 'recruiter' ? COOKIE_RECRUITER : COOKIE_APP, { path: '/' });
  }

  /** Invalidates every outstanding token for the user. */
  async logout(user: AuthUser, ip?: string) {
    await this.users.updateOne({ _id: user.id }, { $inc: { tokenVersion: 1 } });
    await this.audit.log('auth.logout', user, 'User', user.id, {}, ip);
  }

  async changePassword(user: AuthUser, dto: ChangePasswordDto, ip?: string) {
    const doc = await this.users.findById(user.id).select('+passwordHash');
    if (!doc || !(await argon2.verify(doc.passwordHash, dto.currentPassword).catch(() => false))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    doc.passwordHash = await this.hash(dto.newPassword);
    doc.tokenVersion += 1;
    await doc.save();
    await this.audit.log('auth.password_changed', user, 'User', user.id, {}, ip);
  }

  async me(user: AuthUser) {
    const doc = await this.users.findById(user.id).lean();
    return this.toPublic(doc as any);
  }

  toPublic(u: any) {
    return {
      id: String(u._id),
      email: u.email,
      name: u.name,
      role: u.role,
      department: u.department,
      company: u.company,
      active: u.active,
    };
  }
}
