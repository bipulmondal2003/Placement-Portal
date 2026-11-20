import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as argon2 from 'argon2';
import { validateEnv } from '../config/env';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { CacheService } from '../redis/cache.service';
import { AuditModule } from '../audit/audit.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { ReadinessService } from '../readiness/readiness.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { User, StudentProfile } from '../database/schemas/user.schema';
import { Skill, SkillCluster, SkillSynonym } from '../database/schemas/skill.schema';
import { EvidenceItem, Verification } from '../database/schemas/evidence.schema';
import { Assessment, AssessmentAttempt, MockInterview } from '../database/schemas/assessment.schema';
import { PlacementDrive, DriveRequirement, EligibilityRule, Registration } from '../database/schemas/drive.schema';
import { SkillProfile, ReadinessSnapshot } from '../database/schemas/readiness.schema';
import { PreparationPlan, PreparationTask } from '../database/schemas/plan.schema';
import { RecruiterAccessGrant } from '../database/schemas/recruiter.schema';
import { Role, DriveStatus, RegistrationStatus } from '../common/constants';
import { evaluateEligibility } from '../readiness/eligibility.engine';
import { percentToLevel } from '../readiness/profile.builder';
import { levelCapForQuestionCount } from '../assessments/assessments.service';
import { buildRuleBasedPlan } from '../plans/planner';
import { slugify } from '../skills/skills.service';
import { CLUSTERS, SKILLS, SD, DATA, QA } from './taxonomy.data';
import { ASSESSMENTS } from './assessments.data';
import { ROLES } from './roles.data';

/** Deterministic PRNG so every seed run produces the same demo cohort. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** DEVELOPMENT-ONLY demo password. Documented in README; never use outside local demos. */
export const DEMO_PASSWORD = 'Demo@12345';

const FIRST = ['Aarav', 'Diya', 'Vivaan', 'Ananya', 'Aditya', 'Isha', 'Arjun', 'Kavya', 'Rohan', 'Meera', 'Karan', 'Priya', 'Sahil', 'Neha', 'Rahul', 'Sneha', 'Aman', 'Pooja', 'Vikram', 'Riya', 'Nikhil', 'Tanvi', 'Harsh', 'Simran', 'Yash', 'Anjali', 'Manish', 'Divya', 'Siddharth', 'Nisha'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Patel', 'Iyer', 'Nair', 'Reddy', 'Das', 'Mondal', 'Mehta', 'Joshi', 'Kulkarni', 'Banerjee', 'Chatterjee', 'Rao'];
const DEPTS: Array<[string, number]> = [['CSE', 0.5], ['IT', 0.22], ['ECE', 0.18], ['MECH', 0.1]];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    MongooseModule.forRootAsync({ inject: [ConfigService], useFactory: (c: ConfigService) => ({ uri: c.get<string>('MONGODB_URI')! }) }),
    DatabaseModule,
    RedisModule,
    AuditModule,
    SystemConfigModule,
    ReadinessModule,
  ],
})
class SeedModule {}

async function main() {
  const reset = process.argv.includes('--reset');
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== 'true') {
    console.error('Refusing to seed demo data when NODE_ENV=production (set ALLOW_SEED_IN_PRODUCTION=true to override deliberately).');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['error', 'warn'] });
  const get = <T>(name: string): Model<T> => app.get(`${name}Model`);
  const m = {
    users: get<any>('User'), profiles: get<any>('StudentProfile'), skills: get<any>('Skill'), clusters: get<any>('SkillCluster'), synonyms: get<any>('SkillSynonym'),
    evidence: get<any>('EvidenceItem'), verifications: get<any>('Verification'), assessments: get<any>('Assessment'), attempts: get<any>('AssessmentAttempt'),
    interviews: get<any>('MockInterview'), drives: get<any>('PlacementDrive'), reqs: get<any>('DriveRequirement'), rules: get<any>('EligibilityRule'),
    regs: get<any>('Registration'), skillProfiles: get<any>('SkillProfile'), snapshots: get<any>('ReadinessSnapshot'), plans: get<any>('PreparationPlan'),
    tasks: get<any>('PreparationTask'), roles: get<any>('RoleProfile'), grants: get<any>('RecruiterAccessGrant'), batches: get<any>('BatchJob'), access: get<any>('AccessLog'), audit: get<any>('AuditLog'), gaps: get<any>('GapAnalysis'),
  };
  const readiness = app.get(ReadinessService);
  const sysConfig = app.get(SystemConfigService);

  if (reset) {
    console.log('--reset: clearing all collections');
    await Promise.all(Object.values(m).map((model: any) => model.deleteMany({})));
    await get<any>('SystemConfig').deleteMany({});
  }
  await sysConfig.get();

  // ------------------------------------------------------------------ taxonomy (idempotent upserts)
  const clusterId = new Map<string, Types.ObjectId>();
  for (const c of CLUSTERS) {
    const doc = await m.clusters.findOneAndUpdate({ slug: slugify(c.name) }, { $set: { name: c.name, description: c.description, roles: c.roles }, $setOnInsert: { slug: slugify(c.name) } }, { upsert: true, new: true });
    clusterId.set(c.name, doc._id);
  }
  const skillId = new Map<string, Types.ObjectId>();
  for (const s of SKILLS) {
    const slug = slugify(s.name);
    const doc = await m.skills.findOneAndUpdate(
      { slug },
      { $set: { name: s.name, category: s.category, description: s.description, dimension: s.dimension ?? 'technical', roles: s.roles, cluster: s.cluster ? clusterId.get(s.cluster) : undefined, active: true }, $setOnInsert: { slug } },
      { upsert: true, new: true },
    );
    skillId.set(s.name, doc._id);
    for (const term of s.synonyms ?? []) await m.synonyms.updateOne({ term: term.toLowerCase() }, { $setOnInsert: { term: term.toLowerCase(), skill: doc._id } }, { upsert: true });
  }
  console.log(`Taxonomy: ${CLUSTERS.length} clusters, ${SKILLS.length} skills`);
  const sid = (name: string) => {
    const id = skillId.get(name);
    if (!id) throw new Error(`Unknown skill in seed data: ${name}`);
    return id;
  };

  // ------------------------------------------------------------------ target job roles (idempotent upserts)
  const roleId = new Map<string, Types.ObjectId>();
  for (const r of ROLES) {
    const requirements = r.requirements.map(([name, kind, level, weight, mandatory]) => ({
      kind,
      skill: kind === 'skill' ? sid(name) : undefined,
      cluster: kind === 'cluster' ? (clusterId.get(name) ?? (() => { throw new Error(`Unknown cluster in role seed: ${name}`); })()) : undefined,
      requiredLevel: level,
      weight,
      mandatory: !!mandatory,
    }));
    await m.roles.updateOne({ slug: r.slug }, { $set: { title: r.title, family: r.family, summary: r.summary, active: true, requirements }, $setOnInsert: { slug: r.slug } }, { upsert: true });
    const saved: any = await m.roles.findOne({ slug: r.slug }).lean();
    roleId.set(r.slug, saved._id);
  }
  console.log(`Roles: ${ROLES.length} target job roles`);
  const roleIds = ROLES.map((r) => roleId.get(r.slug)!);

  // ------------------------------------------------------------------ staff, recruiters
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const upsertUser = async (email: string, name: string, role: Role, extra: Record<string, any> = {}) =>
    (async () => {
      // updateOne + findOne (instead of findOneAndUpdate) keeps the seed portable across Mongo-compatible servers.
      await m.users.updateOne({ email }, { $setOnInsert: { email, name, role, passwordHash, active: true, tokenVersion: 0, ...extra } }, { upsert: true });
      return m.users.findOne({ email });
    })();

  const admin = await upsertUser('admin@demo.edu', 'Ada Administrator', Role.Admin);
  const officer = await upsertUser('officer@demo.edu', 'Omar Officer', Role.PlacementOfficer);
  const head = await upsertUser('head@demo.edu', 'Helen Head', Role.PlacementHead);
  const fac1 = await upsertUser('faculty1@demo.edu', 'Prof. Farah Khan', Role.Faculty, { department: 'CSE' });
  const fac2 = await upsertUser('faculty2@demo.edu', 'Prof. Ravi Menon', Role.Faculty, { department: 'IT' });
  const rec1 = await upsertUser('recruiter@acme.demo', 'Riley Recruiter', Role.Recruiter, { company: 'Acme Tech' });
  const rec2 = await upsertUser('recruiter@globex.demo', 'Gina Globex', Role.Recruiter, { company: 'Globex Analytics' });
  await upsertUser('recruiter@nogrant.demo', 'Nora NoGrant', Role.Recruiter, { company: 'Umbrella Cloud' });
  void admin;

  const already = await m.users.exists({ email: 'student01@demo.edu' });
  if (already && !reset) {
    console.log('Demo cohort already present; taxonomy and accounts refreshed. Use --reset to rebuild everything.');
    await app.close();
    process.exit(0);
  }

  // ------------------------------------------------------------------ assessments
  const assessmentDocs: any[] = [];
  for (const a of ASSESSMENTS) {
    const doc = await m.assessments.create({
      title: a.title,
      description: a.description,
      durationMinutes: a.durationMinutes,
      maxAttempts: a.maxAttempts,
      status: 'published',
      createdBy: fac1._id,
      questions: a.questions.map((x) => ({ prompt: x.prompt, options: x.options, correctIndex: x.correctIndex, explanation: x.explanation, skill: sid(x.skill) })),
    });
    assessmentDocs.push(doc);
  }

  // ------------------------------------------------------------------ drives
  const mk = async (def: any, reqs: Array<[string, 'skill' | 'cluster', number, number, boolean?]>, rule: any, status: DriveStatus) => {
    const drive = await m.drives.create({ ...def, status, createdBy: officer._id });
    await m.reqs.insertMany(
      reqs.map(([name, kind, level, weight, mandatory]) => ({
        drive: drive._id,
        kind,
        skill: kind === 'skill' ? sid(name) : undefined,
        cluster: kind === 'cluster' ? clusterId.get(name) : undefined,
        requiredLevel: level,
        weight,
        mandatory: !!mandatory,
      })),
    );
    await m.rules.create({ drive: drive._id, ...rule });
    return drive;
  };
  const day = 86_400_000;
  const acme = await mk(
    { company: 'Acme Tech', role: 'Software Development Engineer', roleFamily: SD, description: 'Build and ship full-stack features for Acme’s SaaS platform. Strong DSA, web fundamentals and clear communication expected.', deadline: new Date(Date.now() + 25 * day), driveDate: new Date(Date.now() + 32 * day), location: 'Bengaluru', package: '12-16 LPA' },
    [['Arrays & Strings', 'skill', 3, 8, true], ['Trees & Graphs', 'skill', 3, 7], ['Dynamic Programming', 'skill', 2, 5], ['Frontend Framework', 'cluster', 3, 6], ['Node.js', 'skill', 3, 6], ['REST API Design', 'skill', 3, 6], ['MongoDB', 'skill', 3, 5], ['Git & GitHub', 'skill', 3, 4], ['Object-Oriented Programming', 'skill', 3, 5], ['Problem Solving', 'skill', 3, 6], ['Interview Communication', 'skill', 3, 5]],
    { minCgpa: 7.0, departments: ['CSE', 'IT'], graduationYears: [2027], maxActiveBacklogs: 0, allowHistoryOfBacklogs: true },
    DriveStatus.Published,
  );
  const globex = await mk(
    { company: 'Globex Analytics', role: 'Data Analyst', roleFamily: DATA, description: 'Turn raw data into decisions: SQL, Python analytics, dashboards and clear stakeholder communication.', deadline: new Date(Date.now() + 18 * day), driveDate: new Date(Date.now() + 24 * day), location: 'Hyderabad', package: '8-11 LPA' },
    [['Python', 'skill', 3, 9, true], ['SQL', 'skill', 4, 9, true], ['Pandas & NumPy', 'skill', 3, 7], ['Statistics', 'skill', 3, 7], ['Data Visualization Tool', 'cluster', 3, 5], ['Machine Learning Fundamentals', 'skill', 2, 4], ['Quantitative Aptitude', 'skill', 3, 5], ['Technical Communication', 'skill', 3, 5]],
    { minCgpa: 6.5, departments: ['CSE', 'IT', 'ECE'], graduationYears: [2026, 2027], maxActiveBacklogs: 1, allowHistoryOfBacklogs: true },
    DriveStatus.Published,
  );
  const initech = await mk(
    { company: 'Initech', role: 'QA Automation Engineer', roleFamily: QA, description: 'Design test strategies and automate regression suites for enterprise products.', deadline: new Date(Date.now() + 12 * day), driveDate: new Date(Date.now() + 20 * day), location: 'Pune', package: '6-9 LPA' },
    [['Test Case Design', 'skill', 3, 8, true], ['Manual Testing', 'skill', 3, 6], ['Test Automation Tool', 'cluster', 3, 8], ['API Testing', 'skill', 3, 6], ['Bug Reporting', 'skill', 3, 5], ['Java', 'skill', 2, 4], ['SQL', 'skill', 2, 3], ['Git & GitHub', 'skill', 2, 3], ['Verbal Ability', 'skill', 3, 4], ['Interview Communication', 'skill', 3, 5]],
    { minCgpa: 6.0, departments: [], graduationYears: [2027], maxActiveBacklogs: 2, allowHistoryOfBacklogs: true },
    DriveStatus.Published,
  );
  await mk(
    { company: 'Umbrella Cloud', role: 'Backend Engineer', roleFamily: SD, description: 'Draft drive (not yet approved for release).', deadline: new Date(Date.now() + 40 * day), location: 'Remote', package: '14-18 LPA' },
    [['NestJS', 'skill', 3, 7], ['Docker', 'skill', 3, 5], ['PostgreSQL', 'skill', 3, 6]],
    { minCgpa: 7.5, departments: ['CSE'], graduationYears: [2027], maxActiveBacklogs: 0, allowHistoryOfBacklogs: false },
    DriveStatus.Draft,
  );
  const hooli = await mk(
    { company: 'Hooli', role: 'SDE Intern', roleFamily: SD, description: 'Completed campus drive (kept for funnel and analytics demos).', deadline: new Date(Date.now() - 60 * day), driveDate: new Date(Date.now() - 50 * day), location: 'Mumbai', package: 'Stipend 60k' },
    [['Arrays & Strings', 'skill', 3, 8], ['Problem Solving', 'skill', 3, 6], ['Object-Oriented Programming', 'skill', 2, 5]],
    { minCgpa: 6.5, departments: ['CSE', 'IT'], graduationYears: [2026, 2027], maxActiveBacklogs: 1, allowHistoryOfBacklogs: true },
    DriveStatus.Completed,
  );

  // ------------------------------------------------------------------ students
  const rnd = mulberry32(20260101);
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const pickDept = () => {
    let r = rnd();
    for (const [d, p] of DEPTS) {
      if ((r -= p) <= 0) return d;
    }
    return 'CSE';
  };
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const N = 60;
  const faculty = [fac1, fac2];
  const technical = SKILLS.filter((s) => (s.dimension ?? 'technical') === 'technical');
  const soft = SKILLS.filter((s) => s.dimension === 'aptitude' || s.dimension === 'communication');
  const projectIdeas = [
    ['Campus Marketplace', ['React', 'Node.js', 'MongoDB']],
    ['Expense Tracker API', ['Express.js', 'PostgreSQL', 'Docker']],
    ['Sales Dashboard', ['Python', 'Pandas', 'Tableau']],
    ['Chat Application', ['Next.js', 'Redis', 'TypeScript']],
    ['Test Automation Suite', ['Selenium', 'Java', 'CI/CD']],
    ['Movie Recommender', ['Python', 'scikit-learn', 'Flask']],
    ['Library Management', ['Java', 'Spring Boot', 'MySQL']],
  ] as Array<[string, string[]]>;

  const studentIds: string[] = [];
  const strengthOf = new Map<string, number>();
  const evidenceDocs: any[] = [];
  const verificationDocs: any[] = [];
  const spDocs: any[] = [];
  const attemptDocs: any[] = [];
  const interviewDocs: any[] = [];

  for (let i = 1; i <= N; i++) {
    const email = `student${String(i).padStart(2, '0')}@demo.edu`;
    const dept = i === 1 ? 'CSE' : pickDept();
    const name = i === 1 ? 'Bipul Demo Student' : `${pick(FIRST)} ${pick(LAST)}`;
    const year = i === 1 ? 2027 : rnd() < 0.78 ? 2027 : 2026;
    const strength = i === 1 ? 0.62 : clamp(0.2 + rnd() * 0.75, 0.2, 0.95);
    const cgpa = i === 1 ? 8.2 : Math.round(clamp(5.4 + strength * 3.8 + (rnd() - 0.5), 5.0, 9.8) * 10) / 10;
    const mentor = faculty[i % 2];
    const user = await upsertUser(email, name, Role.Student, { department: dept });
    const uid = user._id as Types.ObjectId;
    studentIds.push(String(uid));
    strengthOf.set(String(uid), strength);

    const proj = [pick(projectIdeas), pick(projectIdeas)];
    await m.profiles.create({
      user: uid,
      rollNumber: `${year}${dept}${String(i).padStart(3, '0')}`,
      department: dept,
      graduationYear: year,
      cgpa,
      tenthPercent: Math.round(clamp(62 + strength * 33 + rnd() * 4, 55, 99) * 10) / 10,
      twelfthPercent: Math.round(clamp(60 + strength * 33 + rnd() * 4, 55, 99) * 10) / 10,
      targetRole: i === 1 ? roleId.get('full-stack-web-developer') : roleIds[i % roleIds.length],
      activeBacklogs: rnd() < 0.1 ? 1 + Math.floor(rnd() * 2) : 0,
      historyOfBacklogs: rnd() < 0.12,
      phone: `+91-98${String(10000000 + Math.floor(rnd() * 89999999))}`,
      headline: `${dept} student interested in ${pick(['full-stack development', 'data analytics', 'software testing', 'backend engineering'])}`,
      mentor: mentor._id,
      projects: proj.map(([title, tech]) => ({ title, description: `${title}: a course project built with ${tech.join(', ')}.`, techStack: tech })),
      certifications: rnd() < 0.5 ? [{ name: pick(['Python for Everybody', 'AWS Cloud Practitioner Essentials', 'Meta Front-End Basics', 'Google Data Analytics']), issuer: 'Online platform', year: 2025 }] : [],
    });

    // Skills this student works on: CSE/IT broad, others narrower.
    const breadth = dept === 'CSE' || dept === 'IT' ? 11 : 6;
    const chosen = new Set<string>();
    while (chosen.size < breadth) chosen.add(pick(technical).name);
    for (const s of soft) if (rnd() < 0.7) chosen.add(s.name);
    const entries: any[] = [];
    for (const name of chosen) {
      const claimed = clamp(Math.round(1 + strength * 4 + (rnd() - 0.5) * 2), 1, 5);
      const roll = rnd();
      const sId = sid(name);
      const declaredOnly = roll > 0.88;
      entries.push({ skill: sId, declaredLevel: clamp(claimed + (rnd() < 0.35 ? 1 : 0), 1, 5), selfReportedLevel: claimed });
      if (declaredOnly) continue; // self-reported but no evidence at all
      const status = roll < 0.55 ? 'verified' : roll < 0.8 ? 'pending' : 'rejected';
      const type = pick(['project', 'project', 'certification', 'academic', 'external']);
      const awarded = status === 'verified' ? clamp(claimed - (rnd() < 0.3 ? 1 : 0), 1, 5) : undefined;
      const when = new Date(Date.now() - Math.floor(rnd() * 70) * day);
      const eid = new Types.ObjectId();
      evidenceDocs.push({
        _id: eid,
        student: uid,
        type,
        title: `${name}: ${type === 'project' ? pick(['mini-project', 'capstone module', 'hackathon build']) : type === 'certification' ? 'course certificate' : type === 'academic' ? 'coursework result' : 'external profile evidence'}`,
        description: `Evidence for ${name}.`,
        url: type === 'project' ? `https://github.com/demo-student-${i}/${slugify(name)}` : undefined,
        source: 'manual',
        status,
        skills: [{ skill: sId, claimedLevel: claimed, awardedLevel: awarded }],
        verifiedAt: status === 'pending' ? undefined : when,
        verifiedBy: status === 'pending' ? undefined : mentor._id,
        createdAt: new Date(when.getTime() - 3 * day),
        updatedAt: when,
      });
      if (status !== 'pending') {
        verificationDocs.push({
          evidence: eid,
          student: uid,
          reviewer: mentor._id,
          decision: status === 'verified' ? 'approved' : 'rejected',
          comment: status === 'verified' ? 'Reviewed the submission; claim is supported.' : 'Insufficient detail to support the claimed level. Please resubmit with more information.',
          awarded: [{ skill: sId, claimedLevel: claimed, awardedLevel: awarded ?? 0 }],
          createdAt: when,
        });
      }
    }
    spDocs.push({ student: uid, skills: entries, projectDepth: 0, version: 0 });

    // Assessment attempts (objective scoring identical to the live platform)
    for (const a of assessmentDocs) {
      if (rnd() > 0.55) continue;
      const attemptsN = rnd() < 0.3 ? 2 : 1;
      let p = clamp(strength + (rnd() - 0.5) * 0.35, 0.1, 1);
      for (let k = 0; k < attemptsN; k++) {
        const answers: number[] = [];
        const per = new Map<string, { correct: number; total: number }>();
        let score = 0;
        for (const q of a.questions) {
          const correct = rnd() < p;
          const ans = correct ? q.correctIndex : (q.correctIndex + 1 + Math.floor(rnd() * (q.options.length - 1))) % q.options.length;
          answers.push(ans);
          if (correct) score++;
          const cur = per.get(String(q.skill)) ?? { correct: 0, total: 0 };
          cur.total++;
          if (correct) cur.correct++;
          per.set(String(q.skill), cur);
        }
        const total = a.questions.length;
        const percent = Math.round((1000 * score) / total) / 10;
        const cfg = await sysConfig.get();
        const perSkill = [...per.entries()].map(([s, v]) => {
          const pct = Math.round((1000 * v.correct) / v.total) / 10;
          return { skill: new Types.ObjectId(s), correct: v.correct, total: v.total, percent: pct, awardedLevel: Math.min(percentToLevel(pct, cfg.assessmentLevelThresholds), levelCapForQuestionCount(v.total)) };
        });
        const when = new Date(Date.now() - (30 - k * 10 + Math.floor(rnd() * 8)) * day);
        const claims = perSkill.filter((x) => x.awardedLevel > 0);
        const eid = new Types.ObjectId();
        if (claims.length) {
          evidenceDocs.push({
            _id: eid, student: uid, type: 'assessment', title: `${a.title} (attempt ${k + 1}, ${percent}%)`, description: 'Objective score computed by the platform', source: 'system', status: 'verified',
            skills: claims.map((c) => ({ skill: c.skill, claimedLevel: c.awardedLevel, awardedLevel: c.awardedLevel })), verifiedAt: when, createdAt: when, updatedAt: when,
            meta: { assessmentId: String(a._id), percent },
          });
          verificationDocs.push({ evidence: eid, student: uid, decision: 'system_approved', comment: 'Objective assessment score computed server-side', awarded: claims.map((c) => ({ skill: c.skill, claimedLevel: c.awardedLevel, awardedLevel: c.awardedLevel })), createdAt: when });
        }
        attemptDocs.push({ assessment: a._id, student: uid, answers, score, total, percent, perSkill, evidence: claims.length ? eid : undefined, submittedAt: when, createdAt: when, updatedAt: when });
        p = clamp(p + 0.08, 0.1, 1);
      }
    }

    // Mock interview for a subset
    if (rnd() < 0.3) {
      const when = new Date(Date.now() - Math.floor(rnd() * 40) * day);
      const lvl = clamp(Math.round(1 + strength * 4), 1, 5);
      const levels = ['Interview Communication', 'Problem Solving'].map((n) => ({ skill: sid(n), level: clamp(lvl + (rnd() < 0.3 ? -1 : 0), 1, 5) }));
      const eid = new Types.ObjectId();
      interviewDocs.push({
        student: uid, interviewer: mentor._id, topic: pick(['Data structures round', 'HR and communication round', 'Web fundamentals round']), conductedAt: when,
        ratings: { technical: clamp(lvl, 1, 5), problemSolving: clamp(lvl, 1, 5), communication: clamp(lvl + (rnd() < 0.5 ? 0 : -1), 1, 5), confidence: clamp(lvl, 1, 5) },
        skillLevels: levels, feedback: 'Clear structure and reasonable depth; keep practising out-loud explanations.', improvements: 'Quantify project impact and practise explaining trade-offs.', evidence: eid, createdAt: when, updatedAt: when,
      });
      evidenceDocs.push({
        _id: eid, student: uid, type: 'mock_interview', title: 'Mock interview', source: 'system', status: 'verified', skills: levels.map((l) => ({ skill: l.skill, claimedLevel: Math.max(1, l.level), awardedLevel: l.level })),
        verifiedAt: when, verifiedBy: mentor._id, createdAt: when, updatedAt: when,
      });
      verificationDocs.push({ evidence: eid, student: uid, reviewer: mentor._id, decision: 'approved', comment: 'Attested by the interviewer', awarded: levels.map((l) => ({ skill: l.skill, claimedLevel: Math.max(1, l.level), awardedLevel: l.level })), createdAt: when });
    }
  }

  await m.skillProfiles.insertMany(spDocs);
  await m.evidence.insertMany(evidenceDocs, { ordered: false, timestamps: false } as any);
  await m.verifications.insertMany(verificationDocs, { ordered: false, timestamps: false } as any);
  await m.attempts.insertMany(attemptDocs, { ordered: false, timestamps: false } as any);
  await m.interviews.insertMany(interviewDocs, { ordered: false, timestamps: false } as any);
  console.log(`Students: ${N}; evidence: ${evidenceDocs.length}; verifications: ${verificationDocs.length}; assessment attempts: ${attemptDocs.length}; mock interviews: ${interviewDocs.length}`);

  // ------------------------------------------------------------------ readiness (through the real engine)
  const publishedContexts = await readiness.loadDriveContexts(undefined, [DriveStatus.Published]);
  const { stats } = await readiness.computeMany(studentIds, publishedContexts, 'seed');
  console.log(`Readiness computed: ${stats.computed} snapshots (${stats.failed} failed)`);

  // ------------------------------------------------------------------ registrations (only eligible students may register)
  const allProfiles = await m.profiles.find().lean();
  const ruleBy = new Map((await m.rules.find().lean()).map((r: any) => [String(r.drive), r]));
  const regDocs: any[] = [];
  for (const drive of [acme, globex, initech, hooli]) {
    for (const p of allProfiles as any[]) {
      const elig = evaluateEligibility(p, ruleBy.get(String(drive._id)) as any);
      if (!elig.eligible || rnd() > 0.65) continue;
      let status = RegistrationStatus.Registered;
      if (String(drive._id) === String(hooli._id)) status = rnd() < 0.45 ? (rnd() < 0.5 ? RegistrationStatus.Selected : RegistrationStatus.Shortlisted) : RegistrationStatus.Rejected;
      else if (rnd() < 0.12) status = RegistrationStatus.Shortlisted;
      regDocs.push({ drive: drive._id, student: p.user, status, eligibilityAtRegistration: { eligible: true, reasons: [], checkedAt: new Date() } });
    }
  }
  // Make sure the primary demo student is registered for Acme if eligible
  const demoStudent = await m.users.findOne({ email: 'student01@demo.edu' });
  void demoStudent;
  await m.regs.insertMany(regDocs, { ordered: false });
  console.log(`Registrations: ${regDocs.length}`);

  // ------------------------------------------------------------------ plans (rule-based, from real gaps) + baseline snapshots for trend/effectiveness demos
  const gapDocs = await get<any>('GapAnalysis').find({ drive: acme._id }).lean();
  let planCount = 0;
  for (const g of gapDocs.slice(0, 24)) {
    const gaps = (g.gaps as any[]).map((x) => ({ ...x, skillId: x.skill ? String(x.skill) : undefined, label: x.label }));
    const tasks = buildRuleBasedPlan(gaps as any, { startDate: new Date(Date.now() - 14 * day), days: 28, hoursPerDay: 2 });
    const plan = await m.plans.create({ student: g.student, drive: acme._id, startDate: new Date(Date.now() - 14 * day), endDate: new Date(Date.now() + 13 * day), hoursPerDay: 2, source: 'rule_based', summary: 'Seeded rule-based plan', basedOnInputsHash: g.inputsHash, status: 'active', createdAt: new Date(Date.now() - 14 * day) } as any);
    const completion = rnd();
    await m.tasks.insertMany(
      tasks.map((t) => {
        const past = t.date.getTime() <= Date.now();
        const done = past && rnd() < completion;
        return { plan: plan._id, student: g.student, dayIndex: t.dayIndex, date: t.date, title: t.title, objective: t.objective, activity: t.activity, exercise: t.exercise, expectedOutcome: t.expectedOutcome, estimatedMinutes: t.estimatedMinutes, skill: t.skill, checkpoint: t.checkpoint, status: done ? 'done' : 'todo', completedAt: done ? t.date : undefined };
      }),
    );
    // Back-dated baseline snapshot (synthetic demo data: the change is random and NOT tied to plan completion).
    const latest: any = await m.snapshots.findOne({ student: g.student, drive: acme._id }).sort({ computedAt: -1 }).lean();
    if (latest) {
      await m.snapshots.collection.insertOne({
        student: g.student, drive: acme._id, score: Math.max(0, Math.round((latest.score - rnd() * 15) * 10) / 10), dimensions: latest.dimensions, explanation: ['Seeded baseline snapshot (demo data)'],
        inputsHash: `seed-baseline-${g.student}`, configVersion: 1, trigger: 'seed', computedAt: new Date(Date.now() - 21 * day),
      });
    }
    planCount++;
  }
  console.log(`Preparation plans: ${planCount}`);

  // ------------------------------------------------------------------ recruiter grants
  const now = Date.now();
  await m.grants.insertMany([
    { recruiter: rec1._id, drive: acme._id, releasedFields: ['department', 'graduationYear', 'readinessScore', 'verifiedSkills'], validFrom: new Date(now - day), expiresAt: new Date(now + 30 * day), createdBy: officer._id, maxResultsPerSearch: 25 },
    { recruiter: rec2._id, drive: globex._id, releasedFields: ['name', 'department', 'cgpa', 'readinessScore', 'readinessDimensions', 'verifiedSkills', 'projects'], validFrom: new Date(now - day), expiresAt: new Date(now + 21 * day), createdBy: head._id, maxResultsPerSearch: 25 },
    // Expired grant kept on purpose so the "expired grants deny access" behaviour can be demonstrated.
    { recruiter: rec2._id, drive: acme._id, releasedFields: ['department'], validFrom: new Date(now - 20 * day), expiresAt: new Date(now - 2 * day), createdBy: officer._id, maxResultsPerSearch: 25 },
  ]);
  console.log('Recruiter grants: 3 (1 expired on purpose)');
  void head;
  void fac2;
  void initech;

  await app.get(CacheService).invalidate('taxonomy', 'dashboards'); // never serve stale cached taxonomy/dashboards after seeding
  console.log('\nSeed complete. All demo accounts use the password: ' + DEMO_PASSWORD);
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
