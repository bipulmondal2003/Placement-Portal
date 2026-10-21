import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Skill, SkillDocument, SkillCluster, SkillClusterDocument, SkillSynonym, SkillSynonymDocument } from '../database/schemas/skill.schema';
import { EvidenceItem, EvidenceItemDocument } from '../database/schemas/evidence.schema';
import { DriveRequirement, DriveRequirementDocument } from '../database/schemas/drive.schema';
import { Question } from '../database/schemas/assessment.schema';
import { CacheService } from '../redis/cache.service';
import { escapeRegex } from '../common/pagination';
import { definedOnly } from '../common/defined-only';

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9+#.]+/g, '-')
    .replace(/^-+|-+$/g, '');

const NS = 'taxonomy';

@Injectable()
export class SkillsService {
  constructor(
    @InjectModel(Skill.name) private readonly skills: Model<SkillDocument>,
    @InjectModel(SkillCluster.name) private readonly clusters: Model<SkillClusterDocument>,
    @InjectModel(SkillSynonym.name) private readonly synonyms: Model<SkillSynonymDocument>,
    @InjectModel(EvidenceItem.name) private readonly evidence: Model<EvidenceItemDocument>,
    @InjectModel(DriveRequirement.name) private readonly reqs: Model<DriveRequirementDocument>,
    private readonly cache: CacheService,
  ) {}

  /** Full active taxonomy (non-private, reused by everyone) -> cached with TTL + explicit invalidation. */
  async taxonomy() {
    return this.cache.getOrSet(NS, 'full', 600, async () => {
      const [skills, clusters, syns] = await Promise.all([
        this.skills.find({ active: true }).sort({ category: 1, name: 1 }).lean(),
        this.clusters.find().sort({ name: 1 }).lean(),
        this.synonyms.find().lean(),
      ]);
      const synBySkill = new Map<string, string[]>();
      for (const s of syns) {
        const k = String(s.skill);
        synBySkill.set(k, [...(synBySkill.get(k) ?? []), s.term]);
      }
      return {
        skills: skills.map((s) => ({
          id: String(s._id),
          name: s.name,
          slug: s.slug,
          category: s.category,
          description: s.description,
          dimension: s.dimension,
          cluster: s.cluster ? String(s.cluster) : null,
          roles: s.roles,
          levelDescriptors: s.levelDescriptors,
          synonyms: synBySkill.get(String(s._id)) ?? [],
        })),
        clusters: clusters.map((c) => ({ id: String(c._id), name: c.name, slug: c.slug, description: c.description, roles: c.roles })),
      };
    });
  }

  /** Synonym-aware search: matches name, description, category and any explicit synonym term. */
  async search(q?: string, category?: string, role?: string, cluster?: string) {
    const tax = await this.taxonomy();
    const term = q?.trim().toLowerCase();
    return tax.skills.filter((s) => {
      if (category && s.category !== category) return false;
      if (role && !s.roles.includes(role)) return false;
      if (cluster && s.cluster !== cluster) return false;
      if (!term) return true;
      return (
        s.name.toLowerCase().includes(term) ||
        s.category.toLowerCase().includes(term) ||
        (s.description ?? '').toLowerCase().includes(term) ||
        s.synonyms.some((x) => x.includes(term))
      );
    });
  }

  /**
   * Maps free text (a resume keyword, "reactjs", "node") to a canonical skill by exact name/slug/synonym.
   * Returns null when nothing matches; there is no fuzzy guessing, so extracted claims stay auditable.
   */
  async resolveTerm(term: string): Promise<{ id: string; name: string } | null> {
    const t = term.trim().toLowerCase();
    if (!t) return null;
    const tax = await this.taxonomy();
    const hit = tax.skills.find((s) => s.name.toLowerCase() === t || s.slug === slugify(t) || s.synonyms.includes(t));
    return hit ? { id: hit.id, name: hit.name } : null;
  }

  async create(dto: { name: string; category: string; description?: string; dimension?: string; cluster?: string; roles?: string[]; levelDescriptors?: string[]; synonyms?: string[] }) {
    const slug = slugify(dto.name);
    if (await this.skills.exists({ slug })) throw new ConflictException('A skill with this name already exists');
    const clash = await this.synonyms.findOne({ term: dto.name.trim().toLowerCase() });
    if (clash) throw new ConflictException('This name is already registered as a synonym of another skill');
    const { synonyms, ...rest } = dto;
    const skill = await this.skills.create({ ...rest, slug });
    for (const term of synonyms ?? []) await this.addSynonym(String(skill._id), term).catch(() => undefined);
    await this.cache.invalidate(NS);
    return skill;
  }

  async update(id: string, dto: Partial<{ name: string; category: string; description: string; dimension: string; cluster: string | null; roles: string[]; levelDescriptors: string[]; active: boolean }>) {
    const skill = await this.skills.findById(id);
    if (!skill) throw new NotFoundException('Skill not found');
    if (dto.name && dto.name !== skill.name) {
      const slug = slugify(dto.name);
      if (await this.skills.exists({ slug, _id: { $ne: skill._id } })) throw new ConflictException('A skill with this name already exists');
      skill.slug = slug;
    }
    Object.assign(skill, definedOnly(dto), { cluster: dto.cluster === null ? undefined : (dto.cluster ?? skill.cluster) });
    await skill.save();
    await this.cache.invalidate(NS);
    return skill;
  }

  async addSynonym(skillId: string, term: string) {
    const t = term.trim().toLowerCase();
    if (!t || t.length > 60) throw new BadRequestException('Synonym must be 1-60 characters');
    if (!(await this.skills.exists({ _id: skillId }))) throw new NotFoundException('Skill not found');
    if (await this.skills.exists({ slug: slugify(t) })) throw new ConflictException('That term is already a skill name');
    try {
      const syn = await this.synonyms.create({ term: t, skill: skillId });
      await this.cache.invalidate(NS);
      return syn;
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('That synonym is already assigned to a skill');
      throw e;
    }
  }

  async removeSynonym(skillId: string, term: string) {
    const res = await this.synonyms.deleteOne({ skill: skillId, term: term.trim().toLowerCase() });
    if (!res.deletedCount) throw new NotFoundException('Synonym not found');
    await this.cache.invalidate(NS);
    return { ok: true };
  }

  /**
   * Merge `sourceId` into `targetId`: repoints evidence claims, drive requirements, assessment questions and
   * synonyms, keeps the source's name as a synonym, then deactivates the source with a mergedInto pointer.
   */
  async merge(sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new BadRequestException('Cannot merge a skill into itself');
    const [source, target] = await Promise.all([this.skills.findById(sourceId), this.skills.findById(targetId)]);
    if (!source || !target) throw new NotFoundException('Skill not found');
    if (!target.active) throw new BadRequestException('Target skill is inactive');
    const s = new Types.ObjectId(sourceId);
    const t = new Types.ObjectId(targetId);

    await this.evidence.updateMany({ 'skills.skill': s }, { $set: { 'skills.$[e].skill': t } }, { arrayFilters: [{ 'e.skill': s }] });
    await this.reqs.updateMany({ skill: s }, { $set: { skill: t } });
    await this.skills.db.collection('assessments').updateMany({ 'questions.skill': s }, { $set: { 'questions.$[q].skill': t } }, { arrayFilters: [{ 'q.skill': s }] });
    await this.synonyms.updateMany({ skill: s }, { $set: { skill: t } });
    await this.synonyms.updateOne({ term: source.name.toLowerCase() }, { $setOnInsert: { skill: t } }, { upsert: true });

    source.active = false;
    source.mergedInto = t;
    await source.save();
    await this.cache.invalidate(NS);
    return { merged: { from: source.name, into: target.name } };
  }

  async createCluster(dto: { name: string; description?: string; roles?: string[] }) {
    const slug = slugify(dto.name);
    if (await this.clusters.exists({ slug })) throw new ConflictException('A cluster with this name already exists');
    const c = await this.clusters.create({ ...dto, slug });
    await this.cache.invalidate(NS);
    return c;
  }

  async updateCluster(id: string, dto: { name?: string; description?: string; roles?: string[] }) {
    const c = await this.clusters.findByIdAndUpdate(id, dto, { new: true });
    if (!c) throw new NotFoundException('Cluster not found');
    await this.cache.invalidate(NS);
    return c;
  }

  /** Skills missing from questions etc. can be validated in bulk. */
  async assertSkillsExist(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    if (unique.some((i) => !Types.ObjectId.isValid(i))) throw new BadRequestException('Invalid skill id');
    const count = await this.skills.countDocuments({ _id: { $in: unique }, active: true });
    if (count !== unique.length) throw new BadRequestException('One or more skills do not exist or are inactive');
  }

  // keep type referenced for consumers
  static readonly _q?: Question;
}
