import { buildFixture, createTestApp, login, TestCtx } from './helpers';

async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 20000): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!ok(v) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 200));
    v = await fn();
  }
  return v;
}

const resumeJson = JSON.stringify({ skills: [{ name: 'SQL', evidence: 'listed' }], projects: [], experience: [], keywords: ['sql'] });
const RESUME = 'Skills: SQL and JavaScript. Project: campus marketplace built with Node.js and MongoDB. '.repeat(2);

describe('Queues, background jobs and caching (integration, real Redis + BullMQ)', () => {
  let ctx: TestCtx;
  let fx: Awaited<ReturnType<typeof buildFixture>>;
  let aiBehaviour: () => any = () => ({ text: resumeJson });
  const aiCalls: number[] = [];
  const client = {
    models: {
      generateContent: async () => {
        aiCalls.push(Date.now());
        return aiBehaviour();
      },
    },
  };

  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: client });
    fx = await buildFixture(ctx);
  });
  afterAll(async () => ctx.close());

  describe('batch readiness job', () => {
    it('is restricted to the placement cell', async () => {
      for (const email of ['s1@t.edu', 'f1@t.edu']) {
        const a = await login(ctx, email);
        expect((await a.post('/api/jobs/batch-readiness').send({})).status).toBe(403);
      }
    });

    it('runs in the background, tracks progress and finishes with consistent counts', async () => {
      const officer = await login(ctx, 'officer@t.edu');
      const started = await officer.post('/api/jobs/batch-readiness').send({}).expect(202);
      expect(started.body.duplicate).toBe(false);
      const id = started.body.batch._id;
      const done = await eventually(
        () => officer.get(`/api/jobs/batches/${id}`).then((r) => r.body),
        (b) => ['completed', 'failed'].includes(b.status),
      );
      expect(done.status).toBe('completed');
      expect(done.failed).toBe(0);
      expect(done.processed + done.skippedUnchanged).toBeGreaterThan(0);
      expect(done.percent).toBe(100);
      const snaps = await ctx.model('ReadinessSnapshot').countDocuments({});
      expect(snaps).toBeGreaterThan(0);
    });

    it('is idempotent: re-running with unchanged inputs writes no new snapshots', async () => {
      const officer = await login(ctx, 'officer@t.edu');
      const Snap = ctx.model('ReadinessSnapshot');
      const before = await Snap.countDocuments({});
      const started = await officer.post('/api/jobs/batch-readiness').send({}).expect(202);
      const done = await eventually(
        () => officer.get(`/api/jobs/batches/${started.body.batch._id}`).then((r) => r.body),
        (b) => ['completed', 'failed'].includes(b.status),
      );
      expect(done.status).toBe('completed');
      expect(done.skippedUnchanged).toBeGreaterThan(0); // every (student, drive) pair was unchanged
      expect(done.skippedUnchanged).toBe(await Snap.countDocuments({}));
      expect(await Snap.countDocuments({})).toBe(before);
    });

    it('de-duplicates an identical batch that is already in flight', async () => {
      const officer = await login(ctx, 'officer@t.edu');
      const { createHash } = await import('crypto');
      const dedupeKey = createHash('sha1').update(JSON.stringify({ driveIds: [], department: null, graduationYear: null })).digest('hex');
      const inflight: any = await ctx.model('BatchJob').create({ requestedBy: fx.users.officer._id, scope: {}, dedupeKey, status: 'active' });
      const res = await officer.post('/api/jobs/batch-readiness').send({}).expect(202);
      expect(res.body.duplicate).toBe(true);
      expect(String(res.body.batch._id)).toBe(String(inflight._id));
      await ctx.model('BatchJob').updateOne({ _id: inflight._id }, { $set: { status: 'completed' } });
    });

    it('exposes queue health for the placement cell', async () => {
      const officer = await login(ctx, 'officer@t.edu');
      const res = await officer.get('/api/jobs/queues').expect(200);
      const text = JSON.stringify(res.body);
      expect(text).toMatch(/readiness/);
      expect(text).toMatch(/ai-tasks|ai/);
    });
  });

  describe('evidence-triggered recalculation', () => {
    it('debounces a burst of verifications into a single recalculation', async () => {
      const Snap = ctx.model('ReadinessSnapshot');
      // settle anything pending from earlier tests
      await new Promise((r) => setTimeout(r, 1500));
      const before = await Snap.countDocuments({ student: fx.users.s1._id, drive: fx.drive._id });
      const s1 = await login(ctx, 's1@t.edu');
      const f1 = await login(ctx, 'f1@t.edu');
      const ids: string[] = [];
      for (const [skill, lvl] of [[fx.skills.sql, 2], [fx.skills.js, 2], [fx.skills.apt, 2]] as any[]) {
        const r = await s1.post('/api/evidence').send({ type: 'project', title: `Burst ${skill.name}`, skills: [{ skill: String(skill._id), claimedLevel: lvl }] }).expect(201);
        ids.push(r.body._id ?? r.body.id);
      }
      for (const id of ids) await f1.post(`/api/evidence/${id}/review`).send({ decision: 'approved' }).expect((r) => expect(r.status).toBeLessThan(300));
      const after = await eventually(() => Snap.countDocuments({ student: fx.users.s1._id, drive: fx.drive._id }), (n) => n > before);
      await new Promise((r) => setTimeout(r, 1500));
      const settled = await Snap.countDocuments({ student: fx.users.s1._id, drive: fx.drive._id });
      expect(after).toBeGreaterThan(before);
      expect(settled - before).toBe(1); // three approvals, one recalculation
    });

    it('reflects the new verified level in the student\'s skill profile', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      const res = await eventually(
        () => s1.get(`/api/students/${fx.users.s1._id}/skills`).then((r) => r.body),
        (b: any) => b.skills.some((s: any) => s.skillId === String(fx.skills.apt._id) && s.verifiedLevel === 2),
      );
      expect(res.skills.find((s: any) => s.skillId === String(fx.skills.apt._id)).verifiedLevel).toBe(2);
    });
  });

  describe('AI background jobs (BullMQ)', () => {
    it('queues a resume analysis and returns the validated result', async () => {
      aiBehaviour = () => ({ text: resumeJson });
      const s3 = await login(ctx, 's3@t.edu');
      const queued = await s3.post('/api/ai/resume/analyze-async').send({ text: RESUME }).expect((r) => expect(r.status).toBeLessThan(300));
      const job = await eventually(
        () => s3.get(`/api/ai/jobs/${queued.body.id}`).then((r) => r.body),
        (j) => ['completed', 'failed'].includes(j.state),
      );
      expect(job.state).toBe('completed');
      expect(JSON.stringify(job.result)).toContain('SQL');
    });

    it('retries a transient provider failure and then succeeds', async () => {
      aiCalls.length = 0;
      let n = 0;
      aiBehaviour = () => {
        n++;
        if (n === 1) throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
        return { text: resumeJson };
      };
      const s3 = await login(ctx, 's3@t.edu');
      const queued = await s3.post('/api/ai/resume/analyze-async').send({ text: RESUME + ' retry' }).expect((r) => expect(r.status).toBeLessThan(300));
      const job = await eventually(
        () => s3.get(`/api/ai/jobs/${queued.body.id}`).then((r) => r.body),
        (j) => ['completed', 'failed'].includes(j.state),
        30000,
      );
      expect(job.state).toBe('completed');
      expect(aiCalls.length).toBe(2);
    });

    it('fails fast (no retries) on a permanent provider error and reports the typed code', async () => {
      aiCalls.length = 0;
      aiBehaviour = () => {
        throw Object.assign(new Error('API key not valid'), { status: 403 });
      };
      const s3 = await login(ctx, 's3@t.edu');
      const queued = await s3.post('/api/ai/resume/analyze-async').send({ text: RESUME + ' permanent' }).expect((r) => expect(r.status).toBeLessThan(300));
      const job = await eventually(
        () => s3.get(`/api/ai/jobs/${queued.body.id}`).then((r) => r.body),
        (j) => j.state === 'failed',
      );
      expect(job.state).toBe('failed');
      expect(aiCalls.length).toBe(1);
      expect(JSON.stringify(job.error)).toMatch(/AI|unavailable|key/i);
    });

    it('hides another student\'s job (looks like it does not exist)', async () => {
      aiBehaviour = () => ({ text: resumeJson });
      const s3 = await login(ctx, 's3@t.edu');
      const s1 = await login(ctx, 's1@t.edu');
      const queued = await s3.post('/api/ai/resume/analyze-async').send({ text: RESUME + ' private' }).expect((r) => expect(r.status).toBeLessThan(300));
      expect((await s1.get(`/api/ai/jobs/${queued.body.id}`)).status).toBe(404);
    });
  });

  describe('cache with TTL and invalidation', () => {
    it('serves the taxonomy from Redis and invalidates it when an admin edits a skill', async () => {
      const admin = await login(ctx, 'admin@t.edu');
      const s1 = await login(ctx, 's1@t.edu');
      const first = await s1.get('/api/skills/taxonomy').expect(200);
      expect(JSON.stringify(first.body)).toContain('JavaScript');
      // The cached copy must survive a direct DB change (proves it is actually served from cache)...
      await ctx.model('Skill').updateOne({ _id: fx.skills.js._id }, { $set: { description: 'changed behind the cache' } });
      const cached = await s1.get('/api/skills/taxonomy').expect(200);
      expect(JSON.stringify(cached.body)).not.toContain('changed behind the cache');
      // ...and be refreshed once the change goes through the API (invalidation).
      await admin.patch(`/api/skills/${fx.skills.js._id}`).send({ description: 'updated via api' }).expect((r) => expect(r.status).toBeLessThan(300));
      const fresh = await s1.get('/api/skills/taxonomy').expect(200);
      expect(JSON.stringify(fresh.body)).toContain('updated via api');
    });

    it('sets a TTL on cache entries (nothing is cached forever)', async () => {
      const Redis = (await import('ioredis')).default;
      const r = new Redis(process.env.REDIS_URL!);
      const keys = await r.keys('prp:*cache*');
      const all = keys.length ? keys : await r.keys('*taxonomy*');
      expect(all.length).toBeGreaterThan(0);
      const ttls = await Promise.all(all.filter((k) => !k.includes(':v')).slice(0, 10).map((k) => r.ttl(k)));
      for (const t of ttls) expect(t).toBeGreaterThan(0);
      await r.quit();
    });

    it('refreshes dashboards after the underlying data changes (invalidation on write)', async () => {
      const officer = await login(ctx, 'officer@t.edu');
      const a = await officer.get('/api/dashboards/officer').expect(200);
      const regs = a.body.registrations ?? {};
      const before = Object.values(regs as Record<string, number>).reduce((x, y) => x + y, 0);
      const s2reg: any = await ctx.model('Registration').findOne({ student: fx.users.s2._id }).lean();
      await officer.patch(`/api/drives/${fx.drive2._id}/registrations/${s2reg._id}`).send({ status: 'shortlisted' }).expect((r) => expect(r.status).toBeLessThan(300));
      const b = await officer.get('/api/dashboards/officer').expect(200);
      expect(b.body.registrations.shortlisted ?? 0).toBeGreaterThan(a.body.registrations.shortlisted ?? 0);
      expect(Object.values(b.body.registrations as Record<string, number>).reduce((x, y) => x + y, 0)).toBe(before);
    });
  });
});
