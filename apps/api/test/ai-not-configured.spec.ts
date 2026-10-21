import { buildFixture, createTestApp, login, TestCtx } from './helpers';

describe('Gemini not configured (no API key)', () => {
  let ctx: TestCtx;
  let fx: Awaited<ReturnType<typeof buildFixture>>;
  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: null });
    fx = await buildFixture(ctx);
  });
  afterAll(async () => ctx.close());

  it('boots, reports AI_NOT_CONFIGURED and keeps the rest of the app working', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    const res = await s1.post('/api/ai/plan').send({ driveId: String(fx.drive._id), days: 14, hoursPerDay: 2 });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI_NOT_CONFIGURED');
    const status = await s1.get('/api/ai/status').expect(200);
    expect(status.body.configured).toBe(false);
    await s1.get(`/api/students/${fx.users.s1._id}/readiness`).expect(200);
  });
});
