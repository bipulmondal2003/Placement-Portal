import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EvidenceItem, EvidenceItemDocument, Verification, VerificationDocument } from '../database/schemas/evidence.schema';
import { AssessmentAttempt, AssessmentAttemptDocument } from '../database/schemas/assessment.schema';
import { PlacementDrive, PlacementDriveDocument } from '../database/schemas/drive.schema';
import { GapAnalysis, GapAnalysisDocument } from '../database/schemas/readiness.schema';
import { EvidenceStatus, DriveStatus } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { AuthorizationService } from '../authz/authz.service';
import { StudentsService } from '../students/students.service';
import { PlansService } from '../plans/plans.service';

/** Per-user dashboards. These contain private data and are therefore never cached under shared keys. */
@Injectable()
export class DashboardsService {
  constructor(
    @InjectModel(EvidenceItem.name) private readonly evidence: Model<EvidenceItemDocument>,
    @InjectModel(Verification.name) private readonly verifications: Model<VerificationDocument>,
    @InjectModel(AssessmentAttempt.name) private readonly attempts: Model<AssessmentAttemptDocument>,
    @InjectModel(PlacementDrive.name) private readonly drives: Model<PlacementDriveDocument>,
    @InjectModel(GapAnalysis.name) private readonly gapAnalyses: Model<GapAnalysisDocument>,
    private readonly authz: AuthorizationService,
    private readonly students: StudentsService,
    private readonly plans: PlansService,
  ) {}

  async student(user: AuthUser) {
    const [profile, skills, readiness, planSummary, pending, upcoming] = await Promise.all([
      this.students.getProfile(user, user.id),
      this.students.skillView(user, user.id),
      this.students.readinessOverview(user, user.id),
      this.plans.activeSummary(user.id),
      this.evidence.countDocuments({ student: user.id, status: EvidenceStatus.Pending }),
      this.drives.find({ status: DriveStatus.Published, deadline: { $gte: new Date() } }).sort({ deadline: 1 }).limit(5).select('company role deadline').lean(),
    ]);
    const gapRows = await this.gapAnalyses.find({ student: user.id }).populate('drive', 'company role').lean();
    const rankedGaps = gapRows
      .flatMap((g) => (g.gaps ?? []).filter((x) => x.gap > 0).map((x) => ({ label: x.label, gap: x.gap, impact: x.impact, drive: `${(g.drive as any)?.company}`, evidenceState: x.evidenceState })))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 8);
    return {
      completion: profile.completion,
      verifiedSkills: skills.skills.filter((s) => s.verifiedLevel > 0).length,
      selfReportedOnly: skills.skills.filter((s) => s.verifiedLevel === 0).length,
      pendingEvidence: pending,
      readinessByDrive: readiness,
      topGaps: rankedGaps,
      upcomingDeadlines: upcoming,
      plans: planSummary,
    };
  }

  async faculty(user: AuthUser) {
    const mentees = await this.authz.menteeIds(user.id);
    const [pending, recent, attempts] = await Promise.all([
      this.evidence.countDocuments({ student: { $in: mentees }, status: EvidenceStatus.Pending }),
      this.verifications.find({ reviewer: user.id }).sort({ createdAt: -1 }).limit(8).populate('evidence', 'title').populate('student', 'name').lean(),
      this.attempts
        .aggregate([
          { $match: { student: { $in: mentees } } },
          { $group: { _id: '$assessment', attempts: { $sum: 1 }, sum: { $sum: '$percent' } } },
        ]),
    ]);
    const totals = await this.verifications.aggregate([{ $match: { reviewer: new Types.ObjectId(user.id) } }, { $group: { _id: '$decision', n: { $sum: 1 } } }]);
    return {
      mentees: mentees.length,
      pendingReviews: pending,
      decisions: Object.fromEntries(totals.map((t) => [t._id, t.n])),
      recentDecisions: recent,
      assessmentPerformance: attempts.map((a) => ({ assessment: String(a._id), attempts: a.attempts, averagePercent: Math.round((a.sum / Math.max(1, a.attempts)) * 10) / 10 })),
    };
  }
}
