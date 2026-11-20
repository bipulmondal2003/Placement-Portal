import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsMongoId, ValidateIf } from 'class-validator';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL, Role } from '../common/constants';
import { RolesService } from './roles.service';

class TargetDto {
  /** A role id, or null to clear the target. */
  @ValidateIf((o) => o.roleId !== null)
  @IsMongoId()
  roleId: string | null;
}

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly svc: RolesService) {}

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get()
  list() {
    return this.svc.list();
  }

  @Roles(Role.Student)
  @Get('matches')
  matches(@CurrentUser() u: AuthUser) {
    return this.svc.matches(u.id);
  }

  @Roles(Role.Student)
  @Get('target')
  target(@CurrentUser() u: AuthUser) {
    return this.svc.getTarget(u.id);
  }

  @Roles(Role.Student)
  @Put('target')
  setTarget(@CurrentUser() u: AuthUser, @Body() dto: TargetDto, @ClientIp() ip: string) {
    return this.svc.setTarget(u, dto.roleId, ip);
  }

  @Roles(Role.Student)
  @Get(':id/match')
  match(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.match(u.id, id);
  }
}
