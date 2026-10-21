import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MockInterview, MockInterviewDocument } from '../database/schemas/assessment.schema';
import { EvidenceType, Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { AuthorizationService } from '../authz/authz.service';
import { EvidenceService } from '../evidence/evidence.service';
import { SkillsService } from '../skills/skills.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { AuditService } from '../audit/audit.service';
import { paginate } from '../common/pagination';

export interface InterviewInput {
  student: string;
  topic: string;
  conductedAt?: Date;
  ratings: { technical: number; problemSolving: number; communication: number; confidence: number };
  skillLevels: Array<{ skill: string; level: number }>;
  feedback?: string;
  improvements?: string;
}

@Injectable()
export class MockInterviewsService {
  constructor(
    @InjectModel(MockInterview.name) private readonly interviews: Model<MockInterviewDocument>,
    private readonly authz: AuthorizationService,
    private readonly evidence: EvidenceService,
    private readonly skills: SkillsService,
    private readonly sysConfig: SystemConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * A faculty interviewer records the evaluation for one of their mentees. Skill levels the interviewer
   * attests to become mock-interview evidence. They count as verified ONLY when the administrator has enabled
   * `mockInterviewAutoVerify`; otherwise they enter the normal pending-review queue.
   */
  async create(faculty: AuthUser, dto: InterviewInput, ip?: string) {
    await this.authz.assertCanAccessStudent(faculty, dto.student);
    const levels = dto.skillLevels ?? [];
    if (new Set(levels.map((l) => l.skill)).size !== levels.length) throw new BadRequestException('Duplicate skill in skillLevels');
    await this.skills.assertSkillsExist(levels.map((l) => l.skill));

    const doc = await this.interviews.create({ ...dto, interviewer: faculty.id });
    const attested = levels.filter((l) => l.level > 0);
    if (attested.length) {
      const cfg = await this.sysConfig.get();
      const ev = await this.evidence.createSystemEvidence({
        student: dto.student,
        type: EvidenceType.MockInterview,
        title: `Mock interview: ${dto.topic}`,
        description: dto.feedback,
        skills: attested,
        verifiedBy: faculty.id,
        meta: { interviewId: String(doc._id) },
        autoVerify: cfg.mockInterviewAutoVerify,
        comment: 'Attested by the interviewer',
      });
      doc.evidence = ev._id as any;
      await doc.save();
    }
    await this.audit.log('mock_interview.create', faculty, 'MockInterview', String(doc._id), { student: dto.student }, ip);
    return doc;
  }

  async listForStudent(user: AuthUser, studentId: string, q: { page: number; limit: number }) {
    await this.authz.assertCanAccessStudent(user, studentId);
    return paginate(this.interviews, { student: studentId }, {
      page: q.page,
      limit: q.limit,
      sort: { conductedAt: -1 },
      populate: [{ path: 'interviewer', select: 'name' }, { path: 'skillLevels.skill', select: 'name' }],
    });
  }

  async listByInterviewer(faculty: AuthUser, q: { page: number; limit: number }) {
    return paginate(this.interviews, { interviewer: faculty.id }, {
      page: q.page,
      limit: q.limit,
      sort: { conductedAt: -1 },
      populate: [{ path: 'student', select: 'name' }, { path: 'skillLevels.skill', select: 'name' }],
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.interviews.findById(id).populate('interviewer', 'name').populate('skillLevels.skill', 'name').lean();
    if (!doc) throw new NotFoundException('Mock interview not found');
    await this.authz.assertCanAccessStudent(user, String(doc.student));
    return doc;
  }

  /** Role check helper for controllers. */
  static canRecord(role: Role) {
    return role === Role.Faculty;
  }
}
