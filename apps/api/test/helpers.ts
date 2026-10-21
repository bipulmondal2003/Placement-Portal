/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import request from 'supertest';
import Redis from 'ioredis';
import { Types } from 'mongoose';

export const PASSWORD = 'Test@12345';
export const ORIGIN = 'http://localhost:3000';

let memoryServer: any;

/**
 * Database for integration tests:
 *  - TEST_MONGODB_URI (e.g. a real MongoDB or a compatible server) if set, else
 *  - mongodb-memory-server (downloads a MongoDB binary on first use).
 * Every test file gets its own database name, so suites never share data.
 */
async function resolveMongoUri(): Promise<string> {
  const db = `prp_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  if (process.env.TEST_MONGODB_URI) return `${process.env.TEST_MONGODB_URI.replace(/\/$/, '')}/${db}`;
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  return `${memoryServer.getUri().replace(/\/$/, '')}/${db}`;
}

export interface TestCtx {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  model: <T = any>(name: string) => import('mongoose').Model<T>;
  close: () => Promise<void>;
}

export async function createTestApp(opts: { geminiStub?: any | null; env?: Record<string, string> } = {}): Promise<TestCtx> {
  const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6390/15';
  const r = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await r.connect();
  await r.flushdb();
  await r.quit();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: await resolveMongoUri(),
    REDIS_URL: redisUrl,
    JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret',
    FRONTEND_URL: ORIGIN,
    EMBED_WORKER: 'true',
    RECALC_DEBOUNCE_MS: '200',
    THROTTLE_LIMIT: '100000',
    RECRUITER_THROTTLE_LIMIT: '1000',
    LOGIN_THROTTLE_LIMIT: '1000',
    AI_THROTTLE_LIMIT: '1000',
    RECRUITER_LOGIN_THROTTLE_LIMIT: '1000',
    GEMINI_API_KEY: opts.geminiStub === null ? '' : 'test-key',
    ...(opts.env ?? {}),
  });

  // Imported lazily so the env above is in place before ConfigModule validates it.
  // NOTE: config is read once per module registry, so use ONE createTestApp() per test file.
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const { GENAI_CLIENT } = await import('../src/ai/ai.client');

  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.geminiStub !== undefined) builder = builder.overrideProvider(GENAI_CLIENT).useValue(opts.geminiStub);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    http: () => request(app.getHttpServer()),
    model: (name) => app.get(getModelToken(name), { strict: false }),
    close: async () => {
      // Drop the per-suite database so test data never accumulates.
      try {
        await (app.get(getModelToken('User'), { strict: false }) as any).db.dropDatabase();
      } catch {
        /* best effort */
      }
      await app.close();
      if (memoryServer) await memoryServer.stop();
    },
  };
}

export const oid = () => new Types.ObjectId();

export async function makeUser(ctx: TestCtx, email: string, role: string, extra: Record<string, any> = {}) {
  const User = ctx.model('User');
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 4096, timeCost: 2 });
  await User.updateOne({ email }, { $setOnInsert: { email, name: email.split('@')[0], role, passwordHash, active: true, tokenVersion: 0, ...extra } }, { upsert: true });
  return (await User.findOne({ email }).lean()) as any;
}

/** A persistent agent logged in through the real endpoint (cookies, CSRF Origin header and all). */
const sessions = new WeakMap<TestCtx, Map<string, Promise<any>>>();
export function login(ctx: TestCtx, email: string, portal: 'app' | 'recruiter' = 'app') {
  // One session per user per test app: logins are rate-limited (by design), so suites reuse them.
  if (!sessions.has(ctx)) sessions.set(ctx, new Map());
  const cache = sessions.get(ctx)!;
  const key = `${portal}:${email}`;
  if (!cache.has(key)) cache.set(key, freshLogin(ctx, email, portal));
  return cache.get(key)! as ReturnType<typeof freshLogin>;
}

export async function freshLogin(ctx: TestCtx, email: string, portal: 'app' | 'recruiter' = 'app') {
  const agent = request.agent(ctx.app.getHttpServer());
  const res = await agent
    .post(portal === 'app' ? '/api/auth/login' : '/api/auth/recruiter/login')
    .set('Origin', ORIGIN)
    .send({ email, password: PASSWORD });
  if (res.status !== 200 && res.status !== 201) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const wrap = (m: 'get' | 'post' | 'put' | 'patch' | 'delete') => (url: string): request.Test => (agent as any)[m](url).set('Origin', ORIGIN);
  return { user: res.body.user, get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete'), agent };
}

export const day = 86_400_000;

/**
 * Small, deterministic fixture:
 *  skills JS (tech), SQL (tech), Aptitude Skill (aptitude); one published drive requiring them (SQL mandatory L3);
 *  students s1 (eligible, mentee of f1), s2 (ineligible: CGPA too low), s3 (eligible, not registered anywhere);
 *  faculty f1 (mentor of s1), f2 (not the mentor); officer, head, admin; recruiters r1 (active grant), r2 (expired grant), r3 (no grant).
 */
export async function buildFixture(ctx: TestCtx) {
  const Skill = ctx.model('Skill');
  const Drive = ctx.model('PlacementDrive');
  const Req = ctx.model('DriveRequirement');
  const Rule = ctx.model('EligibilityRule');
  const Profile = ctx.model('StudentProfile');
  const Reg = ctx.model('Registration');
  const Grant = ctx.model('RecruiterAccessGrant');

  const mkSkill = async (name: string, dimension: string, category = 'Programming') =>
    (await Skill.create({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), category, dimension, roles: ['software-development'], active: true })) as any;
  const js = await mkSkill('JavaScript', 'technical');
  const sql = await mkSkill('SQL', 'technical', 'Databases');
  const apt = await mkSkill('Aptitude Skill', 'aptitude', 'Aptitude');

  const admin = await makeUser(ctx, 'admin@t.edu', 'admin');
  const officer = await makeUser(ctx, 'officer@t.edu', 'placement_officer');
  const head = await makeUser(ctx, 'head@t.edu', 'placement_head');
  const f1 = await makeUser(ctx, 'f1@t.edu', 'faculty', { department: 'CSE' });
  const f2 = await makeUser(ctx, 'f2@t.edu', 'faculty', { department: 'CSE' });
  const s1 = await makeUser(ctx, 's1@t.edu', 'student', { department: 'CSE' });
  const s2 = await makeUser(ctx, 's2@t.edu', 'student', { department: 'CSE' });
  const s3 = await makeUser(ctx, 's3@t.edu', 'student', { department: 'CSE' });
  const r1 = await makeUser(ctx, 'r1@acme.test', 'recruiter', { company: 'Acme' });
  const r2 = await makeUser(ctx, 'r2@globex.test', 'recruiter', { company: 'Globex' });
  const r3 = await makeUser(ctx, 'r3@nogrant.test', 'recruiter', { company: 'Nogrant' });

  const mkProfile = (u: any, cgpa: number, mentor: any) =>
    Profile.create({ user: u._id, rollNumber: `R-${u.email}`, department: 'CSE', graduationYear: 2027, cgpa, tenthPercent: 80, twelfthPercent: 80, activeBacklogs: 0, mentor: mentor._id, phone: '+91-9000000000' });
  await mkProfile(s1, 8.5, f1);
  await mkProfile(s2, 5.0, f2);
  await mkProfile(s3, 8.0, f2);

  const drive = (await Drive.create({
    company: 'Acme', role: 'SDE', roleFamily: 'software-development', status: 'published', description: 'Test drive',
    deadline: new Date(Date.now() + 20 * day), createdBy: officer._id,
  })) as any;
  await Req.insertMany([
    { drive: drive._id, kind: 'skill', skill: sql._id, requiredLevel: 3, weight: 10, mandatory: true },
    { drive: drive._id, kind: 'skill', skill: js._id, requiredLevel: 3, weight: 6, mandatory: false },
    { drive: drive._id, kind: 'skill', skill: apt._id, requiredLevel: 2, weight: 4, mandatory: false },
  ]);
  await Rule.create({ drive: drive._id, minCgpa: 7.0, departments: ['CSE'], graduationYears: [2027], maxActiveBacklogs: 0, allowHistoryOfBacklogs: true });

  // s1 and s3 are registered on the drive; s2 is not (and is ineligible); s3 is registered but unrelated to r2's expired grant.
  const reg1 = (await Reg.create({ drive: drive._id, student: s1._id, status: 'registered', eligibilityAtRegistration: { eligible: true, reasons: [], checkedAt: new Date() } })) as any;
  await Reg.create({ drive: drive._id, student: s3._id, status: 'registered', eligibilityAtRegistration: { eligible: true, reasons: [], checkedAt: new Date() } });

  // A second drive that s2 is registered on (so we can prove grants are drive-scoped).
  const drive2 = (await Drive.create({ company: 'Other', role: 'QA', roleFamily: 'testing', status: 'published', description: 'Other', deadline: new Date(Date.now() + 10 * day), createdBy: officer._id })) as any;
  await Rule.create({ drive: drive2._id, minCgpa: 0, departments: [], graduationYears: [], maxActiveBacklogs: 9, allowHistoryOfBacklogs: true });
  await Reg.create({ drive: drive2._id, student: s2._id, status: 'registered', eligibilityAtRegistration: { eligible: true, reasons: [], checkedAt: new Date() } });

  const now = Date.now();
  await Grant.create({ recruiter: r1._id, drive: drive._id, releasedFields: ['department', 'graduationYear', 'readinessScore', 'verifiedSkills'], validFrom: new Date(now - day), expiresAt: new Date(now + 10 * day), createdBy: officer._id });
  await Grant.create({ recruiter: r2._id, drive: drive._id, releasedFields: ['department'], validFrom: new Date(now - 10 * day), expiresAt: new Date(now - day), createdBy: officer._id });

  return { skills: { js, sql, apt }, users: { admin, officer, head, f1, f2, s1, s2, s3, r1, r2, r3 }, drive, drive2, reg1 };
}
