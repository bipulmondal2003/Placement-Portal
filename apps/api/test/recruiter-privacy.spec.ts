import { buildFixture, createTestApp, day, login, TestCtx } from './helpers';

describe('Recruiter data-release controls (integration, negative tests)', () => {
  let ctx: TestCtx;
  let fx: Awaited<ReturnType<typeof buildFixture>>;
  let r1: Awaited<ReturnType<typeof login>>;
  const base = () => `/api/recruiter/drives/${fx.drive._id}`;

  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: null });
    fx = await buildFixture(ctx);
    r1 = await login(ctx, 'r1@acme.test', 'recruiter');
  });
  afterAll(async () => ctx.close());

  describe('drive scoping', () => {
    it('lists only drives covered by an active grant', async () => {
      const res = await r1.get('/api/recruiter/drives').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].driveId).toBe(String(fx.drive._id));
      expect(res.body[0].releasedFields).toEqual(expect.arrayContaining(['department', 'readinessScore']));
    });

    it('only returns candidates registered for the granted drive', async () => {
      const res = await r1.get(`${base()}/candidates`).expect(200);
      const text = JSON.stringify(res.body);
      expect(res.body.items.length).toBe(2); // s1 and s3
      expect(text).not.toContain(String(fx.users.s2._id));
    });

    it('does not reveal a student registered only on another drive', async () => {
      const reg2: any = await ctx.model('Registration').findOne({ drive: fx.drive2._id, student: fx.users.s2._id }).lean();
      const res = await r1.get(`${base()}/candidates/${reg2._id}`);
      expect([403, 404]).toContain(res.status);
    });

    it('cannot reach a student who is not registered anywhere using their user id', async () => {
      const res = await r1.get(`${base()}/candidates/${fx.users.s2._id}`);
      expect([403, 404]).toContain(res.status);
    });

    it('cannot use a registration id from the granted drive on a different drive path', async () => {
      const res = await r1.get(`/api/recruiter/drives/${fx.drive2._id}/candidates/${fx.reg1._id}`);
      expect([403, 404]).toContain(res.status);
    });

    it('denies a drive the recruiter has no grant for', async () => {
      const res = await r1.get(`/api/recruiter/drives/${fx.drive2._id}/candidates`);
      expect(res.status).toBe(403);
    });

    it('denies a malformed drive id without a server error', async () => {
      const res = await r1.get('/api/recruiter/drives/not-an-id/candidates');
      expect([400, 403, 404]).toContain(res.status);
    });
  });

  describe('field-level release', () => {
    it('returns only the released fields in search results', async () => {
      const res = await r1.get(`${base()}/candidates`).expect(200);
      for (const c of res.body.items) {
        const keys = Object.keys(c).filter((k) => !['candidateId', 'status', 'registrationStatus', 'id'].includes(k));
        for (const k of keys) expect(['department', 'graduationYear', 'readinessScore', 'verifiedSkills']).toContain(k);
        for (const forbidden of ['name', 'email', 'phone', 'cgpa', 'projects', 'readinessDimensions']) expect(c).not.toHaveProperty(forbidden);
      }
    });

    it('never leaks identity or contact details anywhere in the payload', async () => {
      const list = await r1.get(`${base()}/candidates`).expect(200);
      const reg1: any = await ctx.model('Registration').findOne({ drive: fx.drive._id, student: fx.users.s1._id }).lean();
      const detail = await r1.get(`${base()}/candidates/${reg1._id}`).expect(200);
      const text = JSON.stringify([list.body, detail.body]);
      expect(text).not.toContain('s1@t.edu');
      expect(text).not.toContain('+91-9000000000');
      expect(text).not.toContain(String(fx.users.s1._id));
      expect(text).not.toMatch(/passwordHash|rollNumber/);
    });

    it('does not allow filtering on a field that has not been released (no inference attacks)', async () => {
      const all = await r1.get(`${base()}/candidates`).expect(200);
      const res = await r1.get(`${base()}/candidates?minCgpa=9.9`);
      // Either rejected, or the unreleased filter is ignored; it must never narrow the result set based on hidden data.
      if (res.status === 200) expect(res.body.total).toBe(all.body.total);
      else expect([400, 403]).toContain(res.status);
    });

    it('does not let a free-text query match unreleased fields such as the name or email', async () => {
      const res = await r1.get(`${base()}/candidates?q=s1`);
      if (res.status === 200) expect(res.body.items.length).toBeGreaterThanOrEqual(0);
      const named = await r1.get(`${base()}/candidates?q=s1@t.edu`);
      if (named.status === 200) expect(named.body.items).toHaveLength(0);
    });
  });

  describe('time-boxed, revocable grants', () => {
    it('denies access when the grant has expired', async () => {
      const r2 = await login(ctx, 'r2@globex.test', 'recruiter');
      const list = await r2.get('/api/recruiter/drives').expect(200);
      expect(list.body).toHaveLength(0);
      const res = await r2.get(`${base()}/candidates`);
      expect(res.status).toBe(403);
    });

    it('denies access to a recruiter that has no grant at all', async () => {
      const r3 = await login(ctx, 'r3@nogrant.test', 'recruiter');
      const res = await r3.get(`${base()}/candidates`);
      expect(res.status).toBe(403);
    });

    it('stops access immediately after a grant is revoked', async () => {
      const officer = await login(ctx, 'officer@t.edu');
      const created = await officer
        .post('/api/recruiter-access/grants')
        .send({ recruiterId: String(fx.users.r3._id), driveId: String(fx.drive._id), releasedFields: ['department'], expiresAt: new Date(Date.now() + 5 * day).toISOString() })
        .expect((r) => expect(r.status).toBeLessThan(300));
      const r3 = await login(ctx, 'r3@nogrant.test', 'recruiter');
      await r3.get(`${base()}/candidates`).expect(200);
      await officer.post(`/api/recruiter-access/grants/${created.body._id ?? created.body.id}/revoke`).send({ reason: 'test' }).expect((r) => expect(r.status).toBeLessThan(300));
      const after = await r3.get(`${base()}/candidates`);
      expect(after.status).toBe(403);
    });

    it('stops access when the grant window ends (expiry enforced at request time)', async () => {
      await ctx.model('RecruiterAccessGrant').updateMany({ recruiter: fx.users.r1._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await r1.get(`${base()}/candidates`);
      expect(res.status).toBe(403);
      await ctx.model('RecruiterAccessGrant').updateMany({ recruiter: fx.users.r1._id }, { $set: { expiresAt: new Date(Date.now() + 10 * day) } });
      await r1.get(`${base()}/candidates`).expect(200);
    });
  });

  describe('grant administration', () => {
    it('does not let a recruiter create, list or revoke grants or read access logs', async () => {
      const probes = [
        r1.post('/api/recruiter-access/grants').send({ recruiterId: String(fx.users.r1._id), driveId: String(fx.drive._id), releasedFields: ['name'], expiresAt: new Date(Date.now() + day).toISOString() }),
        r1.get('/api/recruiter-access/grants'),
        r1.get('/api/recruiter-access/logs'),
      ];
      for (const res of await Promise.all(probes)) expect([401, 403]).toContain(res.status);
    });

    it('does not let faculty or students administer grants', async () => {
      for (const email of ['f1@t.edu', 's1@t.edu']) {
        const a = await login(ctx, email);
        const res = await a.post('/api/recruiter-access/grants').send({ recruiterId: String(fx.users.r3._id), driveId: String(fx.drive._id), releasedFields: ['department'], expiresAt: new Date(Date.now() + day).toISOString() });
        expect(res.status).toBe(403);
      }
    });

    it('caps grant duration', async () => {
      const officer = await login(ctx, 'officer@t.edu');
      const res = await officer.post('/api/recruiter-access/grants').send({ recruiterId: String(fx.users.r3._id), driveId: String(fx.drive._id), releasedFields: ['department'], expiresAt: new Date(Date.now() + 400 * day).toISOString() });
      expect(res.status).toBe(400);
    });

    it('reserves contact details (email/phone) for the placement head', async () => {
      const officer = await login(ctx, 'officer@t.edu');
      const head = await login(ctx, 'head@t.edu');
      const body = { recruiterId: String(fx.users.r3._id), driveId: String(fx.drive._id), releasedFields: ['department', 'email'], expiresAt: new Date(Date.now() + 5 * day).toISOString() };
      const denied = await officer.post('/api/recruiter-access/grants').send(body);
      expect(denied.status).toBe(403);
      const ok = await head.post('/api/recruiter-access/grants').send(body);
      expect(ok.status).toBeLessThan(300);
    });

    it('rejects field names that are not on the releasable whitelist', async () => {
      const head = await login(ctx, 'head@t.edu');
      const res = await head.post('/api/recruiter-access/grants').send({ recruiterId: String(fx.users.r3._id), driveId: String(fx.drive._id), releasedFields: ['passwordHash'], expiresAt: new Date(Date.now() + day).toISOString() });
      expect(res.status).toBe(400);
    });
  });

  describe('no bulk export and bounded browsing', () => {
    it.each(['export', 'candidates/export', 'candidates.csv', 'download'])('exposes no %s endpoint', async (p) => {
      const res = await r1.get(`${base()}/${p}`);
      expect([404, 403]).toContain(res.status);
    });

    it('caps deep pagination', async () => {
      const res = await r1.get(`${base()}/candidates?page=500&limit=50`);
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) expect(res.body.items).toHaveLength(0);
    });

    it('caps page size', async () => {
      await r1.get(`${base()}/candidates?limit=1000`).expect(400);
    });
  });

  describe('access logging', () => {
    it('records allowed and denied access attempts', async () => {
      const Log = ctx.model('AccessLog');
      const allowed = await Log.countDocuments({ recruiter: fx.users.r1._id, outcome: 'allowed' });
      const denied = await Log.countDocuments({ outcome: 'denied' });
      expect(allowed).toBeGreaterThan(0);
      expect(denied).toBeGreaterThan(0);
    });

    it('lets the placement cell read the access log', async () => {
      const officer = await login(ctx, 'officer@t.edu');
      const res = await officer.get('/api/recruiter-access/logs').expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('recruiter boundaries elsewhere', () => {
    it('cannot read student, drive-management, report or admin APIs', async () => {
      for (const url of [`/api/students/${fx.users.s1._id}/profile`, '/api/drives', '/api/dashboards/officer', '/api/reports/readiness-distribution', '/api/admin/config', '/api/jobs/batches', '/api/evidence/queue']) {
        const res = await r1.get(url);
        expect([401, 403]).toContain(res.status);
      }
    });

    it('cannot start a batch recalculation or change a drive', async () => {
      const a = await r1.post('/api/jobs/batch-readiness').send({});
      const b = await r1.patch(`/api/drives/${fx.drive._id}`).send({ role: 'Hacked' });
      expect([401, 403]).toContain(a.status);
      expect([401, 403]).toContain(b.status);
    });
  });
});
