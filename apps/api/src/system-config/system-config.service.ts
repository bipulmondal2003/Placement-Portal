import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SystemConfig, SystemConfigDocument } from '../database/schemas/system.schema';

export type ConfigData = Omit<SystemConfig, 'key'> & { key?: string };

@Injectable()
export class SystemConfigService {
  constructor(@InjectModel(SystemConfig.name) private readonly model: Model<SystemConfigDocument>) {}

  /** Returns the singleton config, creating it with defaults on first use. */
  async get(): Promise<SystemConfig> {
    const doc = await this.model
      .findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true, new: true, setDefaultsOnInsert: true })
      .lean();
    return doc as unknown as SystemConfig;
  }

  async update(patch: Partial<SystemConfig>): Promise<SystemConfig> {
    await this.get();
    const doc = await this.model
      .findOneAndUpdate({ key: 'main' }, { $set: patch, $inc: { version: 1 } }, { new: true })
      .lean();
    return doc as unknown as SystemConfig;
  }
}
