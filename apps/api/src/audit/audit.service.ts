import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from '../database/schemas/recruiter.schema';
import { AuthUser } from '../common/decorators';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {}

  /** Never throws: auditing must not break the business operation (failures are logged loudly). */
  async log(
    action: string,
    actor: Pick<AuthUser, 'id' | 'role'> | null,
    resourceType?: string,
    resourceId?: string,
    details?: Record<string, any>,
    ip?: string,
  ): Promise<void> {
    try {
      await this.model.create({
        action,
        actor: actor?.id,
        actorRole: actor?.role,
        resourceType,
        resourceId,
        details,
        ip,
      });
    } catch (err) {
      this.logger.error(`AUDIT WRITE FAILED for ${action}: ${(err as Error).message}`);
    }
  }
}
