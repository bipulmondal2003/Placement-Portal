import { buildFixture, createTestApp, login, ORIGIN, PASSWORD, TestCtx } from './helpers';

describe('Auth, RBAC and ownership (integration)', () => {
  let ctx: TestCtx;
  let fx: Awaited<ReturnType<typeof buildFixture>>;

  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: null });
    fx = await buildFixture(ctx);
  });
  afterAll(async () => ctx.close());

  describe('authentication', () => {
    it('rejects requests without a session', async () => {
      await ctx.http().get('/api/drives').expect(401);
    });

    it('rejects a wrong password with a generic message', async () => {
      const res = await ctx.http().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 's1@t.edu', password: 'nope-nope-nope' }).expect(401);
      expect(JSON.stringify(res.body)).not.toMatch(/exist|not found/i);
    });

    it('rejects an unknown user with the same generic message', async () => {
      const a = await ctx.http().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'ghost@t.edu', password: PASSWORD }).expect(401);
      const b = await ctx.http().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 's1@t.edu', password: 'wrong-password' }).expect(401);
      expect(a.body.message).toBe(b.body.message);
    });

    it('sets an httpOnly session cookie and never returns the token or hash in the body', async () => {
      const res = await ctx.http().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 's1@t.edu', password: PASSWORD }).expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('prp_session='))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|token|argon2/i);
    });

    it('stores passwords as argon2id hashes', async () => {
      const u: any = await ctx.model('User').findOne({ email: 's1@t.edu' }).select('+passwordHash').lean();
      expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('rejects state-changing requests from a foreign Origin (CSRF defence)', async () => {
      await ctx.http().post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 's1@t.edu', password: PASSWORD }).expect(403);
    });

    it('invalidates the session on logout (token version bump)', async () => {
      const res = await ctx.http().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 's3@t.edu', password: PASSWORD }).expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
      await ctx.http().get('/api/auth/me').set('Cookie', cookie).expect(200);
      await ctx.http().post('/api/auth/logout').set('Origin', ORIGIN).set('Cookie', cookie).expect((r) => expect(r.status).toBeLessThan(300));
      // The captured cookie (e.g. a stolen copy) must no longer work.
      await ctx.http().get('/api/auth/me').set('Cookie', cookie).expect(401);
    });

    it('does not let anyone self-register as staff', async () => {
      const res = await ctx.http().post('/api/auth/register').set('Origin', ORIGIN).send({ email: 'sneaky@t.edu', password: PASSWORD, name: 'Sneaky', role: 'admin', department: 'CSE' });
      if (res.status < 300) {
        const u: any = await ctx.model('User').findOne({ email: 'sneaky@t.edu' }).lean();
        expect(u.role).toBe('student');
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    it('does not let a recruiter use the normal app login', async () => {
      await ctx.http().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'r1@acme.test', password: PASSWORD }).expect(401);
    });

    it('does not let a student use the recruiter portal login', async () => {
      await ctx.http().post('/api/auth/recruiter/login').set('Origin', ORIGIN).send({ email: 's1@t.edu', password: PASSWORD }).expect(401);
    });

    it('rejects deactivated accounts', async () => {
      await ctx.model('User').updateOne({ email: 's3@t.edu' }, { $set: { active: false } });
      await ctx.http().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 's3@t.edu', password: PASSWORD }).expect(401);
      await ctx.model('User').updateOne({ email: 's3@t.edu' }, { $set: { active: true } });
    });
  });

  describe('role-based access (enforced by the backend)', () => {
    it.each([
      ['student', 's1@t.edu', '/api/dashboards/officer'],
      ['student', 's1@t.edu', '/api/reports/skill-supply-demand'],
      ['student', 's1@t.edu', '/api/recruiter-access/grants'],
      ['student', 's1@t.edu', '/api/jobs/queues'],
      ['student', 's1@t.edu', '/api/admin/config'],
      ['faculty', 'f1@t.edu', '/api/dashboards/officer'],
      ['faculty', 'f1@t.edu', '/api/recruiter-access/grants'],
      ['faculty', 'f1@t.edu', '/api/jobs/queues'],
    ])('%s is forbidden from %s', async (_role, email, url) => {
      const a = await login(ctx, email);
      const res = await a.get(url);
      expect(res.status).toBe(403);
    });

    it('lets the officer read officer dashboards but not admin configuration changes', async () => {
      const o = await login(ctx, 'officer@t.edu');
      await o.get('/api/dashboards/officer').expect(200);
      const res = await o.patch('/api/admin/config').send({ evidenceFloor: 0.5 });
      expect(res.status).toBe(403);
    });

    it('lets the admin update system configuration and rejects invalid values', async () => {
      const a = await login(ctx, 'admin@t.edu');
      await a.patch('/api/admin/config').send({ dimensionWeights: { technical: -1, aptitude: 1, communication: 1, projectDepth: 1 } }).expect(400);
      await a.patch('/api/admin/config').send({ dimensionWeights: { technical: 0, aptitude: 0, communication: 0, projectDepth: 0 } }).expect(400);
      await a.patch('/api/admin/config').send({ dimensionWeights: { technical: 1, aptitude: 1, communication: 1, projectDepth: 1, hacking: 5 } }).expect(400);
      await a.patch('/api/admin/config').send({ evidenceFloor: 2 }).expect(400);
      await a.patch('/api/admin/config').send({ assessmentLevelThresholds: [50, 40, 60, 70, 80] }).expect(400);
      await a.patch('/api/admin/config').send({ evidenceFloor: 0.4 }).expect(200);
    });

    it('prevents a student from creating a drive', async () => {
      const s = await login(ctx, 's1@t.edu');
      await s.post('/api/drives').send({ company: 'X', role: 'Y' }).expect(403);
    });
  });

  describe('student ownership (IDOR)', () => {
    it('lets a student read their own profile', async () => {
      const s = await login(ctx, 's1@t.edu');
      await s.get(`/api/students/${fx.users.s1._id}/profile`).expect(200);
    });

    it.each(['profile', 'skills', 'readiness'])('blocks a student from reading another student\'s %s', async (part) => {
      const s = await login(ctx, 's1@t.edu');
      const res = await s.get(`/api/students/${fx.users.s2._id}/${part}`);
      expect(res.status).toBe(403);
    });

    it('blocks a student from editing another student\'s profile', async () => {
      const s = await login(ctx, 's1@t.edu');
      const res = await s.patch(`/api/students/${fx.users.s2._id}/profile`).send({ cgpa: 10 });
      expect(res.status).toBe(403);
      const p: any = await ctx.model('StudentProfile').findOne({ user: fx.users.s2._id }).lean();
      expect(p.cgpa).toBe(5);
    });

    it('lets only the mentor faculty access a mentee, not other faculty', async () => {
      const mentor = await login(ctx, 'f1@t.edu');
      const other = await login(ctx, 'f2@t.edu');
      await mentor.get(`/api/students/${fx.users.s1._id}/profile`).expect(200);
      const res = await other.get(`/api/students/${fx.users.s1._id}/profile`);
      expect(res.status).toBe(403);
    });

    it('returns 404 (not 500) for a malformed id', async () => {
      const s = await login(ctx, 's1@t.edu');
      const res = await s.get('/api/students/not-an-id/profile');
      expect(res.status).toBe(404);
    });

    it('does not allow students to change protected academic fields beyond the permitted set', async () => {
      const s = await login(ctx, 's1@t.edu');
      await s.patch(`/api/students/${fx.users.s1._id}/profile`).send({ mentor: fx.users.f2._id, role: 'admin' });
      const p: any = await ctx.model('StudentProfile').findOne({ user: fx.users.s1._id }).lean();
      expect(String(p.mentor)).toBe(String(fx.users.f1._id));
    });
  });

  describe('recruiter session confinement', () => {
    it('keeps a recruiter session out of every non-recruiter route', async () => {
      const r = await login(ctx, 'r1@acme.test', 'recruiter');
      for (const url of ['/api/drives', '/api/dashboards/officer', '/api/students/' + fx.users.s1._id + '/profile', '/api/recruiter-access/grants', '/api/reports/skill-supply-demand', '/api/admin/config', '/api/jobs/queues']) {
        const res = await r.get(url);
        expect([401, 403]).toContain(res.status);
      }
    });
  });
});
