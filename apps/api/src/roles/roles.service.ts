import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RoleProfile, RoleProfileDocument } from '../database/schemas/role.schema';
import { StudentProfile, StudentProfileDocument } from '../database/schemas/user.schema';
import { Skill, SkillDocument, SkillCluster, SkillClusterDocument } from '../database/schemas/skill.schema';
import { Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { SkillProfileService } from '../readiness/skill-profile.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { AuditService } from '../audit/audit.service';
import { computeReadiness, Dimension, RequirementInput } from '../readiness/readiness.engine';
import { BAND_LABELS, groupMatch, readinessBand } from './role-match';

type RoleLean = { _id: Types.ObjectId; slug: string; title: string; family: string; summary?: string; requirements: any[] };

/**
 * Role matching: compares a student's VERIFIED skills with the expected skills of a target job role.
 * It reuses the deterministic readiness engine, so a role score follows exactly the same rules as a drive
 * score (verified evidence only, mandatory cap, evidence strength). Nothing here is persisted or AI-driven.
 */
@Injectable()
export class RolesService {
  constructor(
    @InjectModel(RoleProfile.name) private readonly roles: Model<RoleProfileDocument>,
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(Skill.name) private readonly skills: Model<SkillDocument>,
    @InjectModel(SkillCluster.name) private readonly clusters: Model<SkillClusterDocument>,
    private readonly profile: SkillProfileService,
    private readonly sysConfig: SystemConfigService,
    private readonly audit: AuditService,
  ) {}

  /** Expands role requirements (including cluster membership) into engine inputs. */
  private async resolve(roles: RoleLean[]): Promise<Map<string, RequirementInput[]>> {
    const skillIds = new Set<string>();
    const clusterIds = new Set<string>();
    for (const r of roles) for (const q of r.requirements) (q.skill ? skillIds.add(String(q.skill)) : q.cluster && clusterIds.add(String(q.cluster)));
    const [clusterRows, memberRows, directRows] = await Promise.all([
      this.clusters.find({ _id: { $in: [...clusterIds] } }).lean(),
      this.skills.find({ cluster: { $in: [...clusterIds] }, active: true }).select('name dimension cluster').lean(),
      this.skills.find({ _id: { $in: [...skillIds] } }).select('name dimension').lean(),
    ]);
    const clusterName = new Map(clusterRows.map((c) => [String(c._id), c.name]));
    const skillInfo = new Map(directRows.map((s) => [String(s._id), s]));
    const members = new Map<string, Array<{ id: string; name: string; dimension: Dimension }>>();
    for (const m of memberRows) {
      const key = String(m.cluster);
      const list = members.get(key) ?? [];
      list.push({ id: String(m._id), name: m.name, dimension: m.dimension as Dimension });
      members.set(key, list);
    }

    const out = new Map<string, RequirementInput[]>();
    for (const role of roles) {
      const reqs: RequirementInput[] = [];
      for (const q of role.requirements) {
        if (q.kind === 'cluster' && q.cluster) {
          const mem = members.get(String(q.cluster)) ?? [];
          const dims = mem.map((m) => m.dimension);
          const dimension = (dims.sort((a, b) => dims.filter((x) => x === b).length - dims.filter((x) => x === a).length)[0] ?? 'technical') as Dimension;
          reqs.push({
            key: String(q._id),
            kind: 'cluster',
            label: clusterName.get(String(q.cluster)) ?? 'Skill cluster',
            clusterId: String(q.cluster),
            memberSkills: mem.map((m) => ({ id: m.id, name: m.name })),
            requiredLevel: q.requiredLevel,
            weight: q.weight,
            mandatory: q.mandatory,
            dimension,
          });
        } else if (q.skill) {
          const info = skillInfo.get(String(q.skill));
          if (!info) continue;
          reqs.push({
            key: String(q._id),
            kind: 'skill',
            label: info.name,
            skillId: String(q.skill),
            requiredLevel: q.requiredLevel,
            weight: q.weight,
            mandatory: q.mandatory,
            dimension: info.dimension as Dimension,
          });
        }
      }
      out.set(String(role._id), reqs);
    }
    return out;
  }

  private async engineCfg() {
    const cfg = await this.sysConfig.get();
    return { dimensionWeights: cfg.dimensionWeights, evidenceFloor: cfg.evidenceFloor, configVersion: cfg.version };
  }

  private async targetId(studentId: string): Promise<string | null> {
    const p = await this.profiles.findOne({ user: studentId }).select('targetRole').lean();
    return p?.targetRole ? String(p.targetRole) : null;
  }

  /** Resolved requirements of one active role (used by the mock interview to choose what to ask about). */
  async requirementsOf(roleId: string): Promise<{ role: { id: string; title: string; family: string }; requirements: RequirementInput[] }> {
    if (!Types.ObjectId.isValid(roleId)) throw new NotFoundException('Role not found');
    const role = (await this.roles.findOne({ _id: roleId, active: true }).lean()) as unknown as RoleLean | null;
    if (!role) throw new NotFoundException('Role not found');
    const resolved = await this.resolve([role]);
    return { role: { id: String(role._id), title: role.title, family: role.family }, requirements: resolved.get(String(role._id)) ?? [] };
  }

  /** Catalogue of active roles, each with the skills it expects (heaviest first). */
  async list() {
    const roles = (await this.roles.find({ active: true }).sort({ title: 1 }).lean()) as unknown as RoleLean[];
    const resolved = await this.resolve(roles);
    return roles.map((r) => {
      const reqs = resolved.get(String(r._id)) ?? [];
      return {
        id: String(r._id),
        slug: r.slug,
        title: r.title,
        family: r.family,
        summary: r.summary,
        requirementCount: reqs.length,
        mandatoryCount: reqs.filter((q) => q.mandatory).length,
        skills: [...reqs].sort((a, b) => b.weight - a.weight).map((q) => ({ label: q.label, requiredLevel: q.requiredLevel, weight: q.weight, mandatory: q.mandatory, dimension: q.dimension })),
      };
    });
  }

  /** One student's fit for every active role, best fit first. */
  async matches(studentId: string) {
    const roles = (await this.roles.find({ active: true }).lean()) as unknown as RoleLean[];
    if (!roles.length) return [];
    const [resolved, views, cfg, target] = await Promise.all([this.resolve(roles), this.profile.rebuildMany([studentId]), this.engineCfg(), this.targetId(studentId)]);
    const view = views.get(studentId)!;
    const rows = roles.map((r) => {
      const result = computeReadiness(resolved.get(String(r._id)) ?? [], view.states, view.projectDepth, cfg);
      const g = groupMatch(result);
      const band = readinessBand(result.score);
      return {
        roleId: String(r._id),
        title: r.title,
        family: r.family,
        score: result.score,
        band,
        bandLabel: BAND_LABELS[band],
        requirementCount: (resolved.get(String(r._id)) ?? []).length,
        matchedCount: g.matched.length,
        improveCount: g.improve.length,
        missingCount: g.missing.length,
        topGap: result.gaps.find((x) => x.gap > 0)?.label ?? null,
        isTarget: target === String(r._id),
      };
    });
    return rows.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  }

  /** Full comparison for one role: matched / needs improvement / missing, score, band and preparation guidance. */
  async match(studentId: string, roleId: string) {
    if (!Types.ObjectId.isValid(roleId)) throw new NotFoundException('Role not found');
    const role = (await this.roles.findOne({ _id: roleId, active: true }).lean()) as unknown as RoleLean | null;
    if (!role) throw new NotFoundException('Role not found');
    const [resolved, views, cfg, target] = await Promise.all([this.resolve([role]), this.profile.rebuildMany([studentId]), this.engineCfg(), this.targetId(studentId)]);
    const view = views.get(studentId)!;
    const result = computeReadiness(resolved.get(String(role._id)) ?? [], view.states, view.projectDepth, cfg);
    const groups = groupMatch(result);
    const band = readinessBand(result.score);
    return {
      role: { id: String(role._id), slug: role.slug, title: role.title, family: role.family, summary: role.summary },
      isTarget: target === String(role._id),
      score: result.score,
      band,
      bandLabel: BAND_LABELS[band],
      dimensions: result.dimensions,
      cappedByMandatory: result.cappedByMandatory,
      ...groups,
      /** The five highest-impact gaps with a concrete next step each. */
      guidance: result.gaps
        .filter((g) => g.gap > 0)
        .slice(0, 5)
        .map((g) => ({ label: g.label, skillId: g.skillId, requiredLevel: g.requiredLevel, verifiedLevel: g.verifiedLevel, mandatory: g.mandatory, evidenceState: g.evidenceState, impact: g.impact, action: g.action })),
      nextActions: result.nextActions,
      explanation: result.explanation,
    };
  }

  async getTarget(studentId: string) {
    const id = await this.targetId(studentId);
    if (!id) return { roleId: null, match: null };
    const exists = await this.roles.exists({ _id: id, active: true });
    if (!exists) return { roleId: null, match: null };
    return { roleId: id, match: await this.match(studentId, id) };
  }

  async setTarget(user: AuthUser, roleId: string | null, ip?: string) {
    if (user.role !== Role.Student) throw new ForbiddenException('Only students choose a target role');
    if (roleId !== null) {
      if (!Types.ObjectId.isValid(roleId) || !(await this.roles.exists({ _id: roleId, active: true }))) throw new BadRequestException('Unknown role');
    }
    const upd = roleId === null ? { $unset: { targetRole: 1 } } : { $set: { targetRole: new Types.ObjectId(roleId) } };
    const res = await this.profiles.updateOne({ user: user.id }, upd);
    if (!res.matchedCount) throw new NotFoundException('Student profile not found');
    await this.audit.log('student.set_target_role', user, 'Role', roleId ?? 'none', {}, ip);
    return this.getTarget(user.id);
  }
}
