import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthUser } from '../common/decorators';
import { DriveStatus, PLACEMENT_CELL, RegistrationStatus, Role } from '../common/constants';
import { StudentProfile, StudentProfileDocument } from '../database/schemas/user.schema';
import { PlacementDrive, PlacementDriveDocument, Registration, RegistrationDocument } from '../database/schemas/drive.schema';
import {
  AccessLog,
  AccessLogDocument,
  RecruiterAccessGrant,
  RecruiterAccessGrantDocument,
} from '../database/schemas/recruiter.schema';

export interface RecruiterAccessContext {
  ip?: string;
  action: 'list_drives' | 'search' | 'candidate_detail';
  query?: Record<string, any>;
}

/**
 * Central authorisation module. Controllers call these methods instead of scattering ad-hoc checks.
 *  - Student data: ownership / mentor / placement-cell scoping (ABAC on top of RBAC).
 *  - Recruiter data: active, drive-scoped, time-boxed grant + registered-candidate checks.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    @InjectModel(StudentProfile.name) private readonly profiles: Model<StudentProfileDocument>,
    @InjectModel(PlacementDrive.name) private readonly drives: Model<PlacementDriveDocument>,
    @InjectModel(Registration.name) private readonly registrations: Model<RegistrationDocument>,
    @InjectModel(RecruiterAccessGrant.name) private readonly grants: Model<RecruiterAccessGrantDocument>,
    @InjectModel(AccessLog.name) private readonly accessLogs: Model<AccessLogDocument>,
  ) {}

  private isObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;
  }

  /** Throws unless `user` may read/modify data belonging to `studentId`. */
  async assertCanAccessStudent(user: AuthUser, studentId: string): Promise<void> {
    if (!this.isObjectId(studentId)) throw new NotFoundException('Student not found');
    switch (user.role) {
      case Role.Student:
        if (user.id !== studentId) throw new ForbiddenException('You can only access your own data');
        return;
      case Role.Faculty: {
        const mentee = await this.profiles.exists({ user: studentId, mentor: user.id });
        if (!mentee) throw new ForbiddenException('This student is not assigned to you');
        return;
      }
      case Role.PlacementOfficer:
      case Role.PlacementHead:
      case Role.Admin:
        return;
      default:
        throw new ForbiddenException('Not permitted');
    }
  }

  /** IDs of students a faculty member mentors. */
  async menteeIds(facultyId: string): Promise<Types.ObjectId[]> {
    const rows = await this.profiles.find({ mentor: facultyId }).select('user').lean();
    return rows.map((r) => r.user as Types.ObjectId);
  }

  /** True when the actor belongs to the placement cell (officer/head). */
  isPlacementCell(user: AuthUser): boolean {
    return PLACEMENT_CELL.includes(user.role);
  }

  // ---------------------------------------------------------------- recruiter scope

  private async logDenied(recruiterId: string, ctx: RecruiterAccessContext, reason: string, driveId?: string) {
    await this.accessLogs
      .create({
        recruiter: recruiterId,
        drive: driveId && this.isObjectId(driveId) ? driveId : undefined,
        action: ctx.action,
        outcome: 'denied',
        reason,
        query: ctx.query,
        ip: ctx.ip,
      })
      .catch(() => undefined);
  }

  /** Active grants: started, not expired, not revoked. */
  activeGrantFilter(recruiterId: string, now = new Date()) {
    return {
      recruiter: recruiterId,
      validFrom: { $lte: now },
      expiresAt: { $gt: now },
      revokedAt: { $exists: false },
    };
  }

  /**
   * Resolves the recruiter's active grant for a drive or throws 403 (and logs the denial).
   * The error message is deliberately generic: it does not reveal whether the drive exists.
   */
  async requireActiveGrant(
    recruiter: AuthUser,
    driveId: string,
    ctx: RecruiterAccessContext,
  ): Promise<{ grant: RecruiterAccessGrantDocument; drive: PlacementDriveDocument }> {
    const deny = async (reason: string): Promise<never> => {
      await this.logDenied(recruiter.id, ctx, reason, driveId);
      throw new ForbiddenException('No active access grant for this drive');
    };
    if (recruiter.role !== Role.Recruiter) return deny('not_a_recruiter');
    if (!this.isObjectId(driveId)) return deny('invalid_drive_id');

    const grant = await this.grants.findOne({ ...this.activeGrantFilter(recruiter.id), drive: driveId });
    if (!grant) return deny('no_active_grant');

    const drive = await this.drives.findById(driveId);
    // Approved = published or later. Draft drives are never visible to recruiters.
    if (!drive || drive.status === DriveStatus.Draft) return deny('drive_not_approved');
    return { grant, drive };
  }

  /**
   * A recruiter-facing candidate id is a Registration id scoped to ONE drive.
   * It can never resolve to a student who is not registered for the granted drive.
   */
  async requireRegisteredCandidate(
    recruiter: AuthUser,
    grant: RecruiterAccessGrantDocument,
    candidateId: string,
    ctx: RecruiterAccessContext,
  ): Promise<RegistrationDocument> {
    const notFound = async (reason: string): Promise<never> => {
      await this.logDenied(recruiter.id, ctx, reason, String(grant.drive));
      throw new NotFoundException('Candidate not found');
    };
    if (!this.isObjectId(candidateId)) return notFound('invalid_candidate_id');
    const reg = await this.registrations.findOne({
      _id: candidateId,
      drive: grant.drive,
      status: { $ne: RegistrationStatus.Withdrawn },
    });
    if (!reg) return notFound('candidate_not_registered_for_drive');
    return reg;
  }

  /** Drive ids the recruiter currently holds active grants for. */
  async activeGrantsFor(recruiterId: string): Promise<RecruiterAccessGrantDocument[]> {
    return this.grants.find(this.activeGrantFilter(recruiterId)).exec();
  }
}
