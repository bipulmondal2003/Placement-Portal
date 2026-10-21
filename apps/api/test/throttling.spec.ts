import { createTestApp, makeUser, ORIGIN, PASSWORD, TestCtx } from './helpers';

describe('Rate limiting (integration)', () => {
  let ctx: TestCtx;
  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: null, env: { LOGIN_THROTTLE_LIMIT: '10', RECRUITER_LOGIN_THROTTLE_LIMIT: '5' } });
    await makeUser(ctx, 'rr@acme.test', 'recruiter', { company: 'Acme' });
  });
  afterAll(async () => ctx.close());

  it('throttles repeated login attempts with a clean 429 envelope', async () => {
    const statuses: number[] = [];
    let last: any;
    for (let i = 0; i < 14; i++) {
      last = await ctx.http().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'ghost@t.edu', password: 'wrong-password' });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
    expect(last.body.error).toBe('Too Many Requests');
  });

  it('applies a stricter limit to the recruiter portal login', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await ctx.http().post('/api/auth/recruiter/login').set('Origin', ORIGIN).send({ email: 'rr@acme.test', password: i < 7 ? 'wrong-password' : PASSWORD });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
  });
});
