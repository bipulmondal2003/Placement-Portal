import { buildFixture, createTestApp, login, TestCtx } from './helpers';

/** Regression: PATCH must only change the fields that were sent (DTO instances declare every property). */
describe('Partial updates (integration)', () => {
  let ctx: TestCtx;
  let fx: Awaited<ReturnType<typeof buildFixture>>;
  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: null, env: { AI_THROTTLE_LIMIT: '3' } });
    fx = await buildFixture(ctx);
  });
  afterAll(async () => ctx.close());

  it('updates one drive field without wiping the others', async () => {
    const officer = await login(ctx, 'officer@t.edu');
    await officer.patch(`/api/drives/${fx.drive._id}`).send({ location: 'Pune' }).expect((r) => expect(r.status).toBeLessThan(300));
    const d: any = await ctx.model('PlacementDrive').findById(fx.drive._id).lean();
    expect(d.location).toBe('Pune');
    expect(d.company).toBe('Acme');
    expect(d.role).toBe('SDE');
    expect(d.description).toBe('Test drive');
  });

  it('updates one skill field without failing required-field validation', async () => {
    const admin = await login(ctx, 'admin@t.edu');
    await admin.patch(`/api/skills/${fx.skills.sql._id}`).send({ description: 'Relational querying' }).expect((r) => expect(r.status).toBeLessThan(300));
    const s: any = await ctx.model('Skill').findById(fx.skills.sql._id).lean();
    expect(s.description).toBe('Relational querying');
    expect(s.name).toBe('SQL');
    expect(s.category).toBe('Databases');
  });

  it('updates one eligibility rule field without clearing the rest', async () => {
    const officer = await login(ctx, 'officer@t.edu');
    await officer.put(`/api/drives/${fx.drive._id}/eligibility-rule`).send({ minCgpa: 7.5 }).expect((r) => expect(r.status).toBeLessThan(300));
    const rule: any = await ctx.model('EligibilityRule').findOne({ drive: fx.drive._id }).lean();
    expect(rule.minCgpa).toBe(7.5);
    expect(rule.departments).toEqual(['CSE']);
    expect(rule.graduationYears).toEqual([2027]);
  });

  it('applies the per-client AI rate limit', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await s1.get('/api/ai/status')).status);
    // /ai/status is not throttled; the POST endpoints are.
    const posts: number[] = [];
    for (let i = 0; i < 5; i++) posts.push((await s1.post('/api/ai/chat').send({ message: 'hi' })).status);
    expect(posts.slice(0, 3).every((c) => c !== 429)).toBe(true);
    expect(posts.slice(3)).toContain(429);
    expect(codes.every((c) => c === 200)).toBe(true);
  });
});
