import { buildFixture, createTestApp, login, TestCtx } from './helpers';

describe('Target-role match (integration)', () => {
  let ctx: TestCtx;
  let fx: Awaited<ReturnType<typeof buildFixture>>;
  let roleId: string;
  let otherRoleId: string;

  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: null });
    fx = await buildFixture(ctx);
    const Role = ctx.model('RoleProfile');
    const role: any = await Role.create({
      slug: 'test-dev',
      title: 'Test Developer',
      family: 'software-development',
      summary: 'Role used by the tests',
      requirements: [
        { kind: 'skill', skill: fx.skills.sql._id, requiredLevel: 3, weight: 10, mandatory: true },
        { kind: 'skill', skill: fx.skills.js._id, requiredLevel: 3, weight: 6, mandatory: false },
        { kind: 'skill', skill: fx.skills.apt._id, requiredLevel: 2, weight: 4, mandatory: false },
      ],
    });
    roleId = String(role._id);
    const other: any = await Role.create({
      slug: 'js-only',
      title: 'JS Only',
      family: 'software-development',
      requirements: [{ kind: 'skill', skill: fx.skills.js._id, requiredLevel: 2, weight: 5, mandatory: false }],
    });
    otherRoleId = String(other._id);
    await Role.create({ slug: 'retired', title: 'Retired Role', family: 'software-development', active: false, requirements: [{ kind: 'skill', skill: fx.skills.js._id, requiredLevel: 2, weight: 5 }] });
  });
  afterAll(async () => ctx.close());

  /** Verified evidence, as faculty review or assessment scoring would leave it. */
  async function verify(studentId: any, skill: any, level: number, type = 'project') {
    await ctx.model('EvidenceItem').create({
      student: studentId, type, title: `Verified ${type}`, status: 'verified', source: 'manual',
      skills: [{ skill: skill._id, claimedLevel: level, awardedLevel: level }], verifiedAt: new Date(),
    });
  }

  it('lists only active roles with their expected skills', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    const res = await s1.get('/api/roles').expect(200);
    const titles = res.body.map((r: any) => r.title);
    expect(titles).toEqual(expect.arrayContaining(['Test Developer', 'JS Only']));
    expect(titles).not.toContain('Retired Role');
    const dev = res.body.find((r: any) => r.title === 'Test Developer');
    expect(dev.requirementCount).toBe(3);
    expect(dev.mandatoryCount).toBe(1);
    expect(dev.skills[0]).toMatchObject({ label: 'SQL', requiredLevel: 3 });
  });

  it('scores 0 with everything missing for a student with no verified evidence', async () => {
    const s3 = await login(ctx, 's3@t.edu');
    const res = await s3.get(`/api/roles/${roleId}/match`).expect(200);
    expect(res.body.score).toBe(0);
    expect(res.body.band).toBe('getting_started');
    expect(res.body.matched).toHaveLength(0);
    expect(res.body.improve).toHaveLength(0);
    expect(res.body.missing.map((m: any) => m.label).sort()).toEqual(['Aptitude Skill', 'JavaScript', 'SQL']);
    expect(res.body.guidance[0].label).toBe('SQL'); // highest weight x gap first
  });

  it('does not credit self-reported or pending claims', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    await s1.put(`/api/students/${fx.users.s1._id}/skills/${fx.skills.sql._id}/declared`).send({ level: 5 }).expect(200);
    await ctx.model('EvidenceItem').create({
      student: fx.users.s1._id, type: 'project', title: 'Pending SQL', status: 'pending',
      skills: [{ skill: fx.skills.sql._id, claimedLevel: 5 }],
    });
    const res = await s1.get(`/api/roles/${roleId}/match`).expect(200);
    expect(res.body.score).toBe(0);
    const sql = res.body.missing.find((m: any) => m.label === 'SQL');
    expect(sql.selfReportedLevel).toBeGreaterThan(0);
    expect(sql.verifiedLevel).toBe(0);
    await ctx.model('EvidenceItem').deleteMany({ student: fx.users.s1._id });
  });

  it('groups verified skills into matched, improve and missing', async () => {
    await verify(fx.users.s1._id, fx.skills.sql, 4, 'assessment'); // exceeds target 3 -> matched
    await verify(fx.users.s1._id, fx.skills.js, 2); // below target 3 -> improve
    const s1 = await login(ctx, 's1@t.edu');
    const res = await s1.get(`/api/roles/${roleId}/match`).expect(200);
    expect(res.body.matched.map((m: any) => m.label)).toEqual(['SQL']);
    expect(res.body.improve.map((m: any) => m.label)).toEqual(['JavaScript']);
    expect(res.body.improve[0]).toMatchObject({ requiredLevel: 3, verifiedLevel: 2, gap: 1 });
    expect(res.body.missing.map((m: any) => m.label)).toEqual(['Aptitude Skill']);
    expect(res.body.score).toBeGreaterThan(0);
    expect(res.body.score).toBeLessThanOrEqual(100);
    expect(res.body.cappedByMandatory).toBe(false);
    expect(res.body.nextActions.length).toBeGreaterThan(0);
  });

  it('is deterministic: the same evidence gives the same score', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    const a = await s1.get(`/api/roles/${roleId}/match`).expect(200);
    const b = await s1.get(`/api/roles/${roleId}/match`).expect(200);
    expect(b.body.score).toBe(a.body.score);
    expect(b.body.dimensions).toEqual(a.body.dimensions);
  });

  it('ranks roles by fit for the student', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    const res = await s1.get('/api/roles/matches').expect(200);
    expect(res.body.map((r: any) => r.title)).not.toContain('Retired Role');
    const scores = res.body.map((r: any) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const js = res.body.find((r: any) => r.roleId === otherRoleId);
    expect(js.missingCount + js.improveCount + js.matchedCount).toBe(1);
  });

  it('lets a student pick, read and clear a target role', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    expect((await s1.get('/api/roles/target').expect(200)).body.roleId).toBeNull();
    const set = await s1.put('/api/roles/target').send({ roleId }).expect(200);
    expect(set.body.roleId).toBe(roleId);
    expect(set.body.match.role.title).toBe('Test Developer');
    const list = await s1.get('/api/roles/matches').expect(200);
    expect(list.body.find((r: any) => r.roleId === roleId).isTarget).toBe(true);
    const cleared = await s1.put('/api/roles/target').send({ roleId: null }).expect(200);
    expect(cleared.body.roleId).toBeNull();
  });

  it('rejects unknown, inactive and malformed role ids', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    const retired: any = await ctx.model('RoleProfile').findOne({ slug: 'retired' }).lean();
    await s1.put('/api/roles/target').send({ roleId: String(retired._id) }).expect(400);
    await s1.put('/api/roles/target').send({ roleId: '507f1f77bcf86cd799439011' }).expect(400);
    await s1.put('/api/roles/target').send({ roleId: 'nope' }).expect(400);
    await s1.get(`/api/roles/${String(retired._id)}/match`).expect(404);
    await s1.get('/api/roles/not-an-id/match').expect(404);
  });

  it('keeps match and target endpoints student-only, and the catalogue readable by staff', async () => {
    const f1 = await login(ctx, 'f1@t.edu');
    await f1.get(`/api/roles/${roleId}/match`).expect(403);
    await f1.put('/api/roles/target').send({ roleId }).expect(403);
    await f1.get('/api/roles').expect(200);
    const r1 = await login(ctx, 'r1@acme.test', 'recruiter');
    expect([401, 403]).toContain((await r1.get('/api/roles')).status);
  });

  it('only ever reads the signed-in student: another student sees their own data', async () => {
    const s3 = await login(ctx, 's3@t.edu');
    const res = await s3.get(`/api/roles/${roleId}/match`).expect(200);
    expect(res.body.score).toBe(0); // s1's verified evidence is invisible to s3
  });
});
