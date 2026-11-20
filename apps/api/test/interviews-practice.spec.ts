import { buildFixture, createTestApp, login, TestCtx } from './helpers';
import { QUESTION_BANK } from '../src/interviews/question-bank';
import { evaluatePractice } from '../src/interviews/practice-evaluator';
import { buildSummary } from '../src/interviews/interview-summary';

describe('Practice evaluator (unit)', () => {
  const closures = QUESTION_BANK.find((b) => b.question.startsWith('Explain closures'))!;

  it('scores a thorough answer higher than a thin one', () => {
    const good = evaluatePractice(closures, 'A closure is an inner function that keeps access to the variables of its outer function through lexical scope, even after the outer function has returned. For example I used one to build a private counter and for callbacks.');
    const thin = evaluatePractice(closures, 'It is a JavaScript thing.');
    expect(good.score).toBeGreaterThanOrEqual(4);
    expect(thin.score).toBeLessThanOrEqual(2);
    expect(good.score).toBeGreaterThan(thin.score);
  });

  it('is deterministic and names the ideas that were missed', () => {
    const a = evaluatePractice(closures, 'Closures use lexical scope and are common in JavaScript programs I write every day.');
    const b = evaluatePractice(closures, 'Closures use lexical scope and are common in JavaScript programs I write every day.');
    expect(b).toEqual(a);
    expect(a.improvements.join(' ')).toMatch(/Also mention/);
    expect(a.covered).toContain('lexical scope');
  });

  it('caps the score for very short answers even if keywords appear', () => {
    expect(evaluatePractice(closures, 'lexical scope, private counter').score).toBeLessThanOrEqual(2);
  });

  it('has a well-formed bank: unique ids, every question has at least three concepts with keywords', () => {
    expect(new Set(QUESTION_BANK.map((b) => b.id)).size).toBe(QUESTION_BANK.length);
    for (const b of QUESTION_BANK) {
      expect(b.concepts.length).toBeGreaterThanOrEqual(3);
      for (const c of b.concepts) expect(c.any.length).toBeGreaterThan(0);
      for (const c of b.concepts) for (const k of c.any) expect(k).toBe(k.toLowerCase());
    }
  });

  it('builds summaries from scores only', () => {
    const turns: any[] = [
      { role: 'interviewer', text: 'q1', skill: 'SQL' }, { role: 'candidate', text: 'a', feedback: { score: 5, strengths: [], improvements: [] } },
      { role: 'interviewer', text: 'q2', skill: 'Docker' }, { role: 'candidate', text: 'a', feedback: { score: 2, strengths: [], improvements: [] } },
    ];
    const s = buildSummary(turns);
    expect(s.averageScore).toBe(3.5);
    expect(s.strengths).toEqual(['Strong answer on SQL.']);
    expect(s.practiceTopics).toEqual(['Docker']);
    expect(buildSummary([]).averageScore).toBe(0);
  });
});

describe('Mock interview, practice mode (integration, no AI key)', () => {
  let ctx: TestCtx;
  let fx: Awaited<ReturnType<typeof buildFixture>>;
  let roleId: string;
  const GOOD = 'First I clarify the problem, then break it into smaller parts, try a simple example or brute force, optimise it and test edge cases. For example in my project I used a hash map and I built the API myself. The result was a faster service and I learned a lot about trade-offs because of the challenge.';

  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: null });
    fx = await buildFixture(ctx);
    const role: any = await ctx.model('RoleProfile').create({
      slug: 'practice-role', title: 'Practice Role', family: 'software-development',
      requirements: [
        { kind: 'skill', skill: fx.skills.sql._id, requiredLevel: 3, weight: 10, mandatory: true },
        { kind: 'skill', skill: fx.skills.js._id, requiredLevel: 3, weight: 6, mandatory: false },
        { kind: 'skill', skill: fx.skills.apt._id, requiredLevel: 2, weight: 4, mandatory: false },
      ],
    });
    roleId = String(role._id);
  });
  afterAll(async () => ctx.close());

  const start = async (email: string, body: any = {}) => (await login(ctx, email)).post('/api/interviews').send({ roleId, questionCount: 4, ...body });

  it('reports that the AI interviewer is unavailable and uses practice mode by default', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    expect((await s1.get('/api/interviews/options').expect(200)).body.aiAvailable).toBe(false);
    const res = await start('s1@t.edu');
    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('practice');
    expect(res.body.status).toBe('active');
    expect(res.body.turns).toHaveLength(1);
    expect(res.body.turns[0].role).toBe('interviewer');
    expect(res.body.notice).toMatch(/does not change your readiness score/);
    expect(JSON.stringify(res.body)).not.toMatch(/"plan"/);
    await (await login(ctx, 's1@t.edu')).delete(`/api/interviews/${res.body.id}`).expect(200);
  });

  it('refuses to start AI mode when AI is not configured', async () => {
    const res = await start('s1@t.edu', { mode: 'ai' });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI_NOT_CONFIGURED');
  });

  it('runs a full chat: feedback per answer, next questions, then a computed summary', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    let iv = (await s1.post('/api/interviews').send({ roleId, questionCount: 4 }).expect(201)).body;
    const asked: string[] = [iv.turns[0].text];
    for (let i = 0; i < iv.plannedQuestions; i++) {
      expect(iv.status).toBe('active');
      iv = (await s1.post(`/api/interviews/${iv.id}/answer`).send({ answer: GOOD }).expect(201)).body;
      const candidate = iv.turns.filter((t: any) => t.role === 'candidate');
      expect(candidate).toHaveLength(i + 1);
      expect(candidate[i].feedback.score).toBeGreaterThanOrEqual(1);
      expect(candidate[i].feedback.score).toBeLessThanOrEqual(5);
      if (iv.status === 'active') asked.push(iv.turns[iv.turns.length - 1].text);
    }
    expect(iv.status).toBe('completed');
    expect(iv.answered).toBe(iv.plannedQuestions);
    expect(new Set(asked).size).toBe(asked.length); // no repeated question
    expect(iv.summary.averageScore).toBeGreaterThan(0);
    expect(iv.summary.bySkill.length).toBeGreaterThan(0);
    const again = await s1.post(`/api/interviews/${iv.id}/answer`).send({ answer: GOOD });
    expect(again.status).toBe(409);
    const list = (await s1.get('/api/interviews').expect(200)).body;
    expect(list.find((x: any) => x.id === iv.id).averageScore).toBe(iv.summary.averageScore);
  });

  it('is advisory only: it never changes readiness, verified skills or evidence', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    const before = (await s1.get(`/api/roles/${roleId}/match`).expect(200)).body;
    const evBefore = await ctx.model('EvidenceItem').countDocuments({ student: fx.users.s1._id });
    let iv = (await s1.post('/api/interviews').send({ roleId, questionCount: 3 }).expect(201)).body;
    while (iv.status === 'active') iv = (await s1.post(`/api/interviews/${iv.id}/answer`).send({ answer: GOOD }).expect(201)).body;
    const after = (await s1.get(`/api/roles/${roleId}/match`).expect(200)).body;
    expect(after.score).toBe(before.score);
    expect(after.dimensions).toEqual(before.dimensions);
    expect(await ctx.model('EvidenceItem').countDocuments({ student: fx.users.s1._id })).toBe(evBefore);
    expect(await ctx.model('MockInterview').countDocuments({ student: fx.users.s1._id })).toBe(0);
  });

  it('rejects empty, too short and oversized answers', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    const iv = (await s1.post('/api/interviews').send({ roleId, questionCount: 3 }).expect(201)).body;
    expect((await s1.post(`/api/interviews/${iv.id}/answer`).send({ answer: '' })).status).toBe(400);
    expect((await s1.post(`/api/interviews/${iv.id}/answer`).send({ answer: 'ok' })).status).toBe(400);
    expect((await s1.post(`/api/interviews/${iv.id}/answer`).send({ answer: 'x'.repeat(6001) })).status).toBe(400);
    expect((await s1.get(`/api/interviews/${iv.id}`).expect(200)).body.answered).toBe(0);
    await s1.delete(`/api/interviews/${iv.id}`).expect(200);
  });

  it('validates start options', async () => {
    expect((await start('s1@t.edu', { questionCount: 2 })).status).toBe(400);
    expect((await start('s1@t.edu', { questionCount: 20 })).status).toBe(400);
    expect((await start('s1@t.edu', { difficulty: 'impossible' })).status).toBe(400);
    expect((await start('s1@t.edu', { roleId: 'nope' })).status).toBe(400);
    expect((await start('s1@t.edu', { roleId: '507f1f77bcf86cd799439011' })).status).toBe(404);
  });

  it('limits unfinished interviews to three', async () => {
    const s2 = await login(ctx, 's2@t.edu');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await s2.post('/api/interviews').send({ roleId, questionCount: 3 }).expect(201)).body.id);
    expect((await s2.post('/api/interviews').send({ roleId, questionCount: 3 })).status).toBe(409);
    await s2.delete(`/api/interviews/${ids[0]}`).expect(200);
    await s2.post('/api/interviews').send({ roleId, questionCount: 3 }).expect(201);
  });

  it('ends early with a summary, and drops the unanswered question', async () => {
    const s3 = await login(ctx, 's3@t.edu');
    const iv = (await s3.post('/api/interviews').send({ roleId, questionCount: 5 }).expect(201)).body;
    expect((await s3.post(`/api/interviews/${iv.id}/end`)).status).toBe(400); // nothing answered yet
    await s3.post(`/api/interviews/${iv.id}/answer`).send({ answer: GOOD }).expect(201);
    const ended = (await s3.post(`/api/interviews/${iv.id}/end`).expect(201)).body;
    expect(ended.status).toBe('completed');
    expect(ended.turns[ended.turns.length - 1].role).toBe('candidate');
    expect(ended.summary.averageScore).toBeGreaterThan(0);
  });

  it('does not double-record an answer submitted twice at once', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    // make room under the active cap
    await ctx.model('InterviewSession').deleteMany({ student: fx.users.s1._id });
    const iv = (await s1.post('/api/interviews').send({ roleId, questionCount: 5 }).expect(201)).body;
    const [a, b] = await Promise.all([s1.post(`/api/interviews/${iv.id}/answer`).send({ answer: GOOD }), s1.post(`/api/interviews/${iv.id}/answer`).send({ answer: GOOD })]);
    const ok = [a, b].filter((r) => r.status === 201).length;
    expect(ok).toBeGreaterThanOrEqual(1);
    const after = (await s1.get(`/api/interviews/${iv.id}`).expect(200)).body;
    expect(after.answered).toBe(ok);
    // transcript strictly alternates interviewer / candidate
    after.turns.forEach((t: any, i: number) => expect(t.role).toBe(i % 2 === 0 ? 'interviewer' : 'candidate'));
  });

  it('is private to the student and student-only', async () => {
    const s1 = await login(ctx, 's1@t.edu');
    const iv = (await s1.post('/api/interviews').send({ roleId, questionCount: 3 }).expect(201)).body;
    const s2 = await login(ctx, 's2@t.edu');
    expect((await s2.get(`/api/interviews/${iv.id}`)).status).toBe(404);
    expect((await s2.post(`/api/interviews/${iv.id}/answer`).send({ answer: GOOD })).status).toBe(404);
    expect((await s2.delete(`/api/interviews/${iv.id}`)).status).toBe(404);
    expect((await (await login(ctx, 'f1@t.edu')).get(`/api/interviews/${iv.id}`)).status).toBe(403);
    expect((await (await login(ctx, 'officer@t.edu')).get('/api/interviews')).status).toBe(403);
    const r1 = await login(ctx, 'r1@acme.test', 'recruiter');
    expect([401, 403]).toContain((await r1.get('/api/interviews')).status);
  });
});
