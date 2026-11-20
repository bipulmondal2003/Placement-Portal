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
    // Two requests that hit an empty database at the same moment can both try to create the singleton;
    // MongoDB reports the loser as a duplicate-key error (11000). Retrying reads the winner's document.
    for (let attempt = 0; ; attempt++) {
      try {
        const doc = await this.model
          .findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true, new: true, setDefaultsOnInsert: true })
          .lean();
        return doc as unknown as SystemConfig;
      } catch (err) {
        if ((err as { code?: number })?.code !== 11000 || attempt >= 2) throw err;
      }
    }
  }

  async update(patch: Partial<SystemConfig>): Promise<SystemConfig> {
    await this.get();
    const doc = await this.model
      .findOneAndUpdate({ key: 'main' }, { $set: patch, $inc: { version: 1 } }, { new: true })
      .lean();
    return doc as unknown as SystemConfig;
  }
}
