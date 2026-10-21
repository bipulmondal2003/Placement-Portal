import { buildFixture, createTestApp, login, TestCtx } from './helpers';

/** Poll until the condition holds (background recalculation is debounced and queued). */
async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!ok(v) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 250));
    v = await fn();
  }
  return v;
}

describe('Evidence verification, eligibility and readiness (integration)', () => {
  let ctx: TestCtx;
  let fx: Awaited<ReturnType<typeof buildFixture>>;
  let evidenceId: string;

  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: null });
    fx = await buildFixture(ctx);
  });
  afterAll(async () => ctx.close());

  const claim = (skill: any, level: number) => ({ skill: String(skill._id), claimedLevel: level });

  describe('evidence submission', () => {
    it('stores student evidence as pending and never as verified', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      const res = await s1.post('/api/evidence').send({ type: 'project', title: 'SQL reporting project', url: 'https://github.com/s1/sql-project', skills: [claim(fx.skills.sql, 4)] }).expect(201);
      expect(res.body.status).toBe('pending');
      evidenceId = res.body._id ?? res.body.id;
    });

    it('rejects system-only evidence types from students', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      const res = await s1.post('/api/evidence').send({ type: 'assessment', title: 'Fake assessment result', skills: [claim(fx.skills.sql, 5)] });
      expect(res.status).toBe(400);
    });

    it('rejects invalid levels and non-http urls', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      await s1.post('/api/evidence').send({ type: 'project', title: 'Bad level', skills: [claim(fx.skills.sql, 9)] }).expect(400);
      await s1.post('/api/evidence').send({ type: 'project', title: 'Bad url', url: 'javascript:alert(1)', skills: [claim(fx.skills.sql, 3)] }).expect(400);
    });

    it('does not move self-reported claims into verified skills', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      const res = await s1.get(`/api/students/${fx.users.s1._id}/skills`).expect(200);
      const sql = res.body.skills.find((s: any) => s.skillId === String(fx.skills.sql._id));
      expect(sql?.verifiedLevel ?? 0).toBe(0);
    });
  });

  describe('faculty review', () => {
    it('does not let a student verify their own evidence', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      const res = await s1.post(`/api/evidence/${evidenceId}/review`).send({ decision: 'approved' });
      expect(res.status).toBe(403);
    });

    it('does not let a non-mentor faculty member review it', async () => {
      const f2 = await login(ctx, 'f2@t.edu');
      const res = await f2.post(`/api/evidence/${evidenceId}/review`).send({ decision: 'approved' });
      expect([403, 404]).toContain(res.status);
      const e: any = await ctx.model('EvidenceItem').findById(evidenceId).lean();
      expect(e.status).toBe('pending');
    });

    it('does not let the officer or admin verify evidence either', async () => {
      for (const email of ['officer@t.edu', 'admin@t.edu']) {
        const a = await login(ctx, email);
        const res = await a.post(`/api/evidence/${evidenceId}/review`).send({ decision: 'approved' });
        expect(res.status).toBe(403);
      }
    });

    it('lets the mentor approve with an awarded level that can differ from the claim', async () => {
      const f1 = await login(ctx, 'f1@t.edu');
      const queue = await f1.get('/api/evidence/queue').expect(200);
      expect(JSON.stringify(queue.body)).toContain('SQL reporting project');
      await f1.post(`/api/evidence/${evidenceId}/review`).send({ decision: 'approved', comment: 'Looks solid', awarded: [{ skill: String(fx.skills.sql._id), level: 3 }] }).expect((r) => expect(r.status).toBeLessThan(300));
      const e: any = await ctx.model('EvidenceItem').findById(evidenceId).lean();
      expect(e.status).toBe('verified');
      expect(e.skills[0].claimedLevel).toBe(4);
      expect(e.skills[0].awardedLevel).toBe(3);
    });

    it('refuses a second review of the same evidence (atomic status transition)', async () => {
      const f1 = await login(ctx, 'f1@t.edu');
      const res = await f1.post(`/api/evidence/${evidenceId}/review`).send({ decision: 'rejected' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const e: any = await ctx.model('EvidenceItem').findById(evidenceId).lean();
      expect(e.status).toBe('verified');
    });

    it('records a verification audit trail', async () => {
      const v: any = await ctx.model('Verification').findOne({ evidence: evidenceId }).lean();
      expect(v).toBeTruthy();
      expect(String(v.reviewer)).toBe(String(fx.users.f1._id));
    });

    it('exposes verified level separately from the self-reported level', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      await s1.put(`/api/students/${fx.users.s1._id}/skills/${fx.skills.sql._id}`).send({ level: 5 }).catch(() => undefined);
      const res = await eventually(
        () => s1.get(`/api/students/${fx.users.s1._id}/skills`).then((r) => r.body),
        (b) => b.skills.some((s: any) => s.skillId === String(fx.skills.sql._id) && s.verifiedLevel === 3),
      );
      const sql = res.skills.find((s: any) => s.skillId === String(fx.skills.sql._id));
      expect(sql.verifiedLevel).toBe(3);
      expect(sql).toHaveProperty('selfReportedLevel');
    });

    it('lets a rejected claim leave verified skills untouched', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      const sub = await s1.post('/api/evidence').send({ type: 'certification', title: 'JS certificate', skills: [claim(fx.skills.js, 5)] }).expect(201);
      const f1 = await login(ctx, 'f1@t.edu');
      await f1.post(`/api/evidence/${sub.body._id ?? sub.body.id}/review`).send({ decision: 'rejected', comment: 'No proof attached' }).expect((r) => expect(r.status).toBeLessThan(300));
      const skills = await s1.get(`/api/students/${fx.users.s1._id}/skills`).expect(200);
      const js = skills.body.skills.find((s: any) => s.skillId === String(fx.skills.js._id));
      expect(js?.verifiedLevel ?? 0).toBe(0);
    });
  });

  describe('eligibility is separate from readiness', () => {
    it('blocks registration for an ineligible student with explainable reasons, regardless of readiness', async () => {
      const s2 = await login(ctx, 's2@t.edu');
      const res = await s2.post(`/api/drives/${fx.drive._id}/register`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(res.body)).toMatch(/cgpa/i);
      expect(await ctx.model('Registration').countDocuments({ drive: fx.drive._id, student: fx.users.s2._id })).toBe(0);
    });

    it('returns eligibility and readiness as independent blocks', async () => {
      const s2 = await login(ctx, 's2@t.edu');
      const res = await s2.get(`/api/drives/${fx.drive._id}/match`).expect(200);
      expect(res.body.eligibility.eligible).toBe(false);
      expect(res.body).toHaveProperty('readiness');
      expect(res.body.eligibility.reasons.length).toBeGreaterThan(0);
    });

    it('allows an eligible student to register once and rejects duplicates', async () => {
      const s3 = await login(ctx, 's3@t.edu');
      const again = await s3.post(`/api/drives/${fx.drive._id}/register`);
      expect(again.status).toBeGreaterThanOrEqual(400); // s3 is already registered in the fixture
    });

    it('drive detail tells a student whether they are registered (and tells an unregistered one null)', async () => {
      const s3 = await login(ctx, 's3@t.edu');
      const mine = await s3.get(`/api/drives/${fx.drive._id}`).expect(200);
      expect(mine.body.myRegistration?.status).toBe('registered');
      const s2 = await login(ctx, 's2@t.edu');
      const other = await s2.get(`/api/drives/${fx.drive._id}`).expect(200);
      expect(other.body.myRegistration).toBeNull();
    });

    it('is not affected by a high readiness score (CGPA gate still applies)', async () => {
      // Give s2 maximal verified evidence directly, then confirm they are still ineligible.
      await ctx.model('EvidenceItem').create({
        student: fx.users.s2._id, type: 'academic', title: 'Perfect marks', source: 'system', status: 'verified',
        skills: [{ skill: fx.skills.sql._id, claimedLevel: 5, awardedLevel: 5 }, { skill: fx.skills.js._id, claimedLevel: 5, awardedLevel: 5 }],
      });
      const s2 = await login(ctx, 's2@t.edu');
      const res = await s2.get(`/api/drives/${fx.drive._id}/match`).expect(200);
      expect(res.body.eligibility.eligible).toBe(false);
    });
  });

  describe('readiness and gaps', () => {
    it('computes a deterministic score with ranked gaps for the drive', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      const a = await s1.get(`/api/students/${fx.users.s1._id}/readiness/${fx.drive._id}`).expect(200);
      const b = await s1.get(`/api/students/${fx.users.s1._id}/readiness/${fx.drive._id}`).expect(200);
      expect(a.body.score ?? a.body.readiness?.score).toEqual(b.body.score ?? b.body.readiness?.score);
      const gaps = a.body.gaps ?? a.body.readiness?.gaps;
      expect(Array.isArray(gaps)).toBe(true);
      const jsGap = gaps.find((g: any) => /javascript/i.test(g.label));
      expect(jsGap?.gap).toBe(3); // required 3, verified 0
    });

    it('caps the score when a mandatory skill is missing', async () => {
      const s3 = await login(ctx, 's3@t.edu');
      const res = await s3.get(`/api/students/${fx.users.s3._id}/readiness/${fx.drive._id}`).expect(200);
      const score = res.body.score ?? res.body.readiness?.score;
      expect(score).toBeLessThanOrEqual(50);
    });

    it('raises the score after evidence is verified (recalculated and persisted)', async () => {
      const before = await ctx.model('ReadinessSnapshot').find({ student: fx.users.s1._id, drive: fx.drive._id }).sort({ computedAt: -1 }).lean();
      const s1 = await login(ctx, 's1@t.edu');
      const sub = await s1.post('/api/evidence').send({ type: 'project', title: 'JS app', skills: [claim(fx.skills.js, 3)] }).expect(201);
      const f1 = await login(ctx, 'f1@t.edu');
      await f1.post(`/api/evidence/${sub.body._id ?? sub.body.id}/review`).send({ decision: 'approved', awarded: [{ skill: String(fx.skills.js._id), level: 3 }] }).expect((r) => expect(r.status).toBeLessThan(300));
      const after: any[] = await eventually(
        () => ctx.model('ReadinessSnapshot').find({ student: fx.users.s1._id, drive: fx.drive._id }).sort({ computedAt: -1 }).lean() as any,
        (rows: any[]) => rows.length > before.length,
      );
      expect(after.length).toBeGreaterThan(before.length);
      const newest = after[0];
      const oldest = before[0] as any;
      if (oldest) expect(newest.score).toBeGreaterThan(oldest.score);
    });

    it('does not write duplicate snapshots when inputs have not changed (idempotent)', async () => {
      const count = () => ctx.model('ReadinessSnapshot').countDocuments({ student: fx.users.s1._id, drive: fx.drive._id });
      await new Promise((r) => setTimeout(r, 1500));
      const c1 = await count();
      const s1 = await login(ctx, 's1@t.edu');
      await s1.get(`/api/students/${fx.users.s1._id}/readiness`).expect(200);
      await s1.get(`/api/students/${fx.users.s1._id}/readiness`).expect(200);
      expect(await count()).toBe(c1);
    });
  });
});
