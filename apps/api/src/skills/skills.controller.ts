import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { definedOnly } from '../common/defined-only';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { Role, SKILL_CATEGORIES, SkillDimension, PROFICIENCY_SCALE } from '../common/constants';
import { SkillsService } from './skills.service';
import { AuditService } from '../audit/audit.service';

class SkillDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsString() @MaxLength(80) category: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
  @IsOptional() @IsEnum(SkillDimension) dimension?: SkillDimension;
  @IsOptional() @IsMongoId() cluster?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) roles?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) levelDescriptors?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) synonyms?: string[];
}

class UpdateSkillDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
  @IsOptional() @IsEnum(SkillDimension) dimension?: SkillDimension;
  @IsOptional() @IsMongoId() cluster?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) levelDescriptors?: string[];
  @IsOptional() active?: boolean;
}

class SynonymDto {
  @IsString() @MinLength(1) @MaxLength(60) term: string;
}
class MergeDto {
  @IsMongoId() targetId: string;
}
class ClusterDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
}

@ApiTags('skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService, private readonly audit: AuditService) {}

  @Get()
  list(@Query('q') q?: string, @Query('category') category?: string, @Query('role') role?: string, @Query('cluster') cluster?: string) {
    return this.skills.search(q?.slice(0, 80), category, role, cluster);
  }

  @Get('taxonomy')
  taxonomy() {
    return this.skills.taxonomy();
  }

  @Get('meta')
  meta() {
    return { categories: SKILL_CATEGORIES, proficiencyScale: PROFICIENCY_SCALE, dimensions: Object.values(SkillDimension), roles: ['software-development', 'data', 'testing'] };
  }

  @Roles(Role.Admin)
  @Post()
  async create(@Body() dto: SkillDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    const s = await this.skills.create(dto);
    await this.audit.log('skill.create', u, 'Skill', String(s._id), { name: dto.name }, ip);
    return s;
  }

  @Roles(Role.Admin)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSkillDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    const s = await this.skills.update(id, dto as any);
    await this.audit.log('skill.update', u, 'Skill', id, { changed: Object.keys(dto) }, ip);
    return s;
  }

  @Roles(Role.Admin)
  @Post(':id/synonyms')
  async addSynonym(@Param('id') id: string, @Body() dto: SynonymDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    const s = await this.skills.addSynonym(id, dto.term);
    await this.audit.log('skill.synonym_add', u, 'Skill', id, { term: dto.term }, ip);
    return s;
  }

  @Roles(Role.Admin)
  @Delete(':id/synonyms/:term')
  async removeSynonym(@Param('id') id: string, @Param('term') term: string, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    const r = await this.skills.removeSynonym(id, term);
    await this.audit.log('skill.synonym_remove', u, 'Skill', id, { term }, ip);
    return r;
  }

  @Roles(Role.Admin)
  @Post(':id/merge')
  async merge(@Param('id') id: string, @Body() dto: MergeDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    const r = await this.skills.merge(id, dto.targetId);
    await this.audit.log('skill.merge', u, 'Skill', id, { into: dto.targetId }, ip);
    return r;
  }

  @Roles(Role.Admin)
  @Post('clusters')
  async createCluster(@Body() dto: ClusterDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    const c = await this.skills.createCluster(dto);
    await this.audit.log('cluster.create', u, 'SkillCluster', String(c._id), { name: dto.name }, ip);
    return c;
  }

  @Roles(Role.Admin)
  @Patch('clusters/:id')
  async updateCluster(@Param('id') id: string, @Body() dto: ClusterDto, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    const c = await this.skills.updateCluster(id, definedOnly(dto));
    await this.audit.log('cluster.update', u, 'SkillCluster', id, {}, ip);
    return c;
  }
}
