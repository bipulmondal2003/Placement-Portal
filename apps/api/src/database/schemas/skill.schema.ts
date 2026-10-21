import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { SkillDimension } from '../../common/constants';

/** A cluster groups related skills, e.g. "Frontend Framework" -> React, Vue, Angular. */
@Schema({ timestamps: true })
export class SkillCluster {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true })
  slug: string;

  @Prop({ trim: true })
  description?: string;

  /** Target roles this cluster is relevant to (software-development, data, testing). */
  @Prop({ type: [String], default: [] })
  roles: string[];
}
export type SkillClusterDocument = HydratedDocument<SkillCluster>;
export const SkillClusterSchema = SchemaFactory.createForClass(SkillCluster);

@Schema({ timestamps: true })
export class Skill {
  @Prop({ required: true, trim: true, maxlength: 80 })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true })
  slug: string;

  @Prop({ required: true, trim: true, index: true })
  category: string;

  @Prop({ trim: true, maxlength: 600 })
  description?: string;

  @Prop({ enum: Object.values(SkillDimension), default: SkillDimension.Technical, index: true })
  dimension: SkillDimension;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'SkillCluster', index: true })
  cluster?: Types.ObjectId;

  /** Target roles this skill maps to (role mappings from the taxonomy workshop). */
  @Prop({ type: [String], default: [], index: true })
  roles: string[];

  /** Optional per-skill descriptors for levels 1..5. */
  @Prop({ type: [String], default: [] })
  levelDescriptors: string[];

  @Prop({ default: true, index: true })
  active: boolean;

  /** Set when this skill was merged into another; lookups follow the pointer. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill' })
  mergedInto?: Types.ObjectId;
}
export type SkillDocument = HydratedDocument<Skill>;
export const SkillSchema = SchemaFactory.createForClass(Skill);
SkillSchema.index({ name: 'text', description: 'text' });

/** Explicit synonym. `term` is normalised (lowercase, trimmed) and globally unique. */
@Schema({ timestamps: true })
export class SkillSynonym {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  term: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Skill', required: true, index: true })
  skill: Types.ObjectId;
}
export type SkillSynonymDocument = HydratedDocument<SkillSynonym>;
export const SkillSynonymSchema = SchemaFactory.createForClass(SkillSynonym);
