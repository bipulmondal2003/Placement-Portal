import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL, Role } from '../common/constants';
import { PlansService } from './plans.service';

class GenerateDto {
  @IsMongoId() driveId: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(90) days?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) @Max(10) hoursPerDay?: number;
  @IsOptional() @IsDateString() startDate?: string;
}
class TaskStatusDto {
  @IsIn(['todo', 'in_progress', 'done']) status: 'todo' | 'in_progress' | 'done';
}

@ApiTags('preparation-plans')
@Controller('preparation-plans')
export class PlansController {
  constructor(private readonly svc: PlansService) {}

  @Roles(Role.Student)
  @Post()
  generate(@CurrentUser() u: AuthUser, @Body() dto: GenerateDto, @ClientIp() ip: string) {
    return this.svc.generate(u, { ...dto, startDate: dto.startDate ? new Date(dto.startDate) : undefined }, ip);
  }

  @Roles(Role.Student)
  @Get()
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.listForStudent(u, u.id);
  }

  @Roles(Role.Student)
  @Get('calendar')
  calendar(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const f = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const t = to ? new Date(to) : new Date(Date.now() + 60 * 86_400_000);
    if (isNaN(f.getTime()) || isNaN(t.getTime()) || t < f) throw new BadRequestException('Invalid date range');
    if (t.getTime() - f.getTime() > 180 * 86_400_000) throw new BadRequestException('Range too large (max 180 days)');
    return this.svc.calendar(u, f, t);
  }

  @Roles(Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get('student/:studentId')
  forStudent(@CurrentUser() u: AuthUser, @Param('studentId') studentId: string) {
    return this.svc.listForStudent(u, studentId);
  }

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id);
  }

  @Roles(Role.Student)
  @Patch(':id/tasks/:taskId')
  task(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('taskId') taskId: string, @Body() dto: TaskStatusDto) {
    return this.svc.updateTask(u, id, taskId, dto.status);
  }

  @Roles(Role.Student)
  @Delete(':id')
  archive(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.archive(u, id);
  }
}
