import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IsBoolean, IsEmail, IsEnum, IsMongoId, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL, Role } from '../common/constants';
import { PaginationQueryDto, escapeRegex, paginate } from '../common/pagination';
import { User, UserDocument, StudentProfile, StudentProfileDocument } from '../database/schemas/user.schema';
import { SkillProfile, SkillProfileDocument } from '../database/schemas/readiness.schema';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { definedOnly } from '../common/defined-only';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @Matches(/^(?=.*[A-Za-z])(?=.*\d).{10,128}$/, { message: 'Password must be 10+ chars with a letter and a number' }) password: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsEnum(Role) role: Role;
  @IsOptional() @IsString() @MaxLength(80) department?: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsString() @MaxLength(80) department?: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class UserListQuery extends PaginationQueryDto {
  @IsOptional() @IsEnum(Role) role?: Role;
}

class AssignMentorDto {
  @IsMongoId() facultyId: string;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(SkillProfile.name) private readonly skillProfiles: Model<SkillProfileDocument>,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Roles(Role.Admin)
  @Get()
  async list(@Query() q: UserListQuery) {
    const filter: Record<string, any> = {};
    if (q.role) filter.role = q.role;
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    return paginate(this.users, filter, { page: q.page, limit: q.limit, sort: { createdAt: -1 } });
  }

  /** Faculty directory for mentor assignment dropdowns. */
  @Roles(Role.Admin, ...PLACEMENT_CELL)
  @Get('faculty')
  async faculty() {
    return this.users.find({ role: Role.Faculty, active: true }).select('name email department').sort({ name: 1 }).lean();
  }

  @Roles(Role.Admin)
  @Post()
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser, @ClientIp() ip: string) {
    const email = dto.email.toLowerCase().trim();
    if (await this.users.exists({ email })) throw new ConflictException('An account with this email already exists');
    const user = await this.users.create({
      email,
      name: dto.name.trim(),
      role: dto.role,
      department: dto.department,
      company: dto.company,
      passwordHash: await this.auth.hash(dto.password),
    });
    if (dto.role === Role.Student) {
      await this.profiles.create({ user: user._id, department: dto.department });
      await this.skillProfiles.create({ student: user._id, skills: [] });
    }
    await this.audit.log('user.create', actor, 'User', String(user._id), { role: dto.role }, ip);
    return this.auth.toPublic(user);
  }

  @Roles(Role.Admin)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser, @ClientIp() ip: string) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== actor.role))) {
      throw new BadRequestException('Administrators cannot deactivate or demote their own account');
    }
    const sensitive = dto.active === false || (dto.role !== undefined && dto.role !== user.role);
    Object.assign(user, definedOnly(dto));
    // Role change / deactivation: kill existing sessions immediately.
    if (sensitive) user.tokenVersion += 1;
    await user.save();
    if (dto.role === Role.Student && !(await this.profiles.exists({ user: user._id }))) {
      await this.profiles.create({ user: user._id, department: user.department });
      await this.skillProfiles.updateOne({ student: user._id }, { $setOnInsert: { skills: [] } }, { upsert: true });
    }
    await this.audit.log('user.update', actor, 'User', id, { changed: Object.keys(dto) }, ip);
    return this.auth.toPublic(user);
  }

  /** Assigns the faculty mentor who verifies this student's evidence. */
  @Roles(Role.Admin, ...PLACEMENT_CELL)
  @Put(':id/mentor')
  async assignMentor(@Param('id') id: string, @Body() dto: AssignMentorDto, @CurrentUser() actor: AuthUser, @ClientIp() ip: string) {
    const faculty = await this.users.findOne({ _id: dto.facultyId, role: Role.Faculty, active: true });
    if (!faculty) throw new BadRequestException('facultyId must reference an active faculty account');
    const res = await this.profiles.updateOne({ user: id }, { $set: { mentor: faculty._id } });
    if (!res.matchedCount) throw new NotFoundException('Student profile not found');
    await this.audit.log('student.assign_mentor', actor, 'StudentProfile', id, { facultyId: dto.facultyId }, ip);
    return { ok: true };
  }
}
