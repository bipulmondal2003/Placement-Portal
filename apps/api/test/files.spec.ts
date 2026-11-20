import { buildFixture, createTestApp, login, TestCtx } from './helpers';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-png-body')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpeg-body')]);

describe('Certificate upload (integration)', () => {
  let ctx: TestCtx;
  let fx: Awaited<ReturnType<typeof buildFixture>>;

  beforeAll(async () => {
    ctx = await createTestApp({ geminiStub: null });
    fx = await buildFixture(ctx);
  });
  afterAll(async () => ctx.close());

  const claim = () => [{ skill: String(fx.skills.sql._id), claimedLevel: 3 }];
  const upload = async (email: string, buf: Buffer, name: string) => (await login(ctx, email)).post('/api/files/certificates').attach('file', buf, name);

  describe('upload validation', () => {
    it('accepts a PDF, PNG and JPEG and reports detected type and size', async () => {
      const pdf = await upload('s1@t.edu', PDF, 'AWS Cloud Practitioner.pdf').then((r) => r);
      expect(pdf.status).toBe(201);
      expect(pdf.body).toMatchObject({ name: 'AWS Cloud Practitioner.pdf', mimeType: 'application/pdf', size: PDF.length });
      expect((await upload('s1@t.edu', PNG, 'scan.png')).body.mimeType).toBe('image/png');
      expect((await upload('s1@t.edu', JPG, 'photo.jpeg')).body.mimeType).toBe('image/jpeg');
    });

    it('rejects a file whose bytes are not PDF/PNG/JPEG, whatever its name or declared type', async () => {
      const exe = await upload('s1@t.edu', Buffer.from('MZ\x90\x00 this is not a pdf'), 'certificate.pdf');
      expect(exe.status).toBe(400);
      const html = await (await login(ctx, 's1@t.edu')).post('/api/files/certificates').attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'cert.png', contentType: 'image/png' });
      expect(html.status).toBe(400);
    });

    it('rejects files over 2 MB', async () => {
      const big = Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024 + 10, 0x41)]);
      const res = await upload('s1@t.edu', big, 'huge.pdf');
      expect(res.status).toBe(413);
    });

    it('rejects a request with no file', async () => {
      const res = await (await login(ctx, 's1@t.edu')).post('/api/files/certificates');
      expect(res.status).toBe(400);
    });

    it('strips path and markup characters from the stored file name', async () => {
      const res = await upload('s1@t.edu', PDF, '../../etc/<img src=x onerror=alert(1)>.pdf');
      expect(res.status).toBe(201);
      expect(res.body.name).not.toMatch(/[\/<>\\]/);
      expect(res.body.name.endsWith('.pdf')).toBe(true);
    });

    it('is student-only', async () => {
      expect((await upload('f1@t.edu', PDF, 'x.pdf')).status).toBe(403);
      expect((await upload('officer@t.edu', PDF, 'x.pdf')).status).toBe(403);
    });

    it('caps the number of stored files per student', async () => {
      const File = ctx.model('StoredFile');
      await File.deleteMany({ owner: fx.users.s3._id });
      const docs = Array.from({ length: 20 }, (_, i) => ({ owner: fx.users.s3._id, purpose: 'certificate', originalName: `f${i}.pdf`, mimeType: 'application/pdf', size: 10, sha256: 'x', data: PDF }));
      await File.insertMany(docs);
      expect((await upload('s3@t.edu', PDF, 'one-too-many.pdf')).status).toBe(409);
    });
  });

  describe('attaching to certification evidence', () => {
    let fileId: string;
    let evidenceId: string;

    it('submits certification evidence with the uploaded file; it starts pending and is not verified', async () => {
      fileId = (await upload('s1@t.edu', PDF, 'sql-cert.pdf')).body.id;
      const s1 = await login(ctx, 's1@t.edu');
      const res = await s1.post('/api/evidence').send({ type: 'certification', title: 'SQL certificate', fileId, skills: claim() }).expect(201);
      evidenceId = res.body._id;
      expect(res.body.status).toBe('pending');
      expect(res.body.file).toMatchObject({ id: fileId, name: 'sql-cert.pdf', mimeType: 'application/pdf' });
      const skills = await s1.get(`/api/students/${fx.users.s1._id}/skills`).expect(200);
      expect(skills.body.skills.find((s: any) => s.skillId === String(fx.skills.sql._id))?.verifiedLevel ?? 0).toBe(0);
    });

    it('does not allow the same file on a second evidence item', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      const res = await s1.post('/api/evidence').send({ type: 'certification', title: 'Reused file', fileId, skills: claim() });
      expect(res.status).toBe(409);
    });

    it('does not allow attaching another student\'s file', async () => {
      const otherFile = (await upload('s2@t.edu', PDF, 's2.pdf')).body.id;
      const s1 = await login(ctx, 's1@t.edu');
      expect((await s1.post('/api/evidence').send({ type: 'certification', title: 'Stolen file', fileId: otherFile, skills: claim() })).status).toBe(400);
    });

    it('allows files on certification evidence only', async () => {
      const f = (await upload('s1@t.edu', PDF, 'proj.pdf')).body.id;
      const s1 = await login(ctx, 's1@t.edu');
      expect((await s1.post('/api/evidence').send({ type: 'project', title: 'Project with file', fileId: f, skills: claim() })).status).toBe(400);
    });

    it('rejects malformed or unknown file ids', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      expect((await s1.post('/api/evidence').send({ type: 'certification', title: 'Bad id', fileId: 'nope', skills: claim() })).status).toBe(400);
      expect((await s1.post('/api/evidence').send({ type: 'certification', title: 'Missing id', fileId: '507f1f77bcf86cd799439011', skills: claim() })).status).toBe(400);
    });

    it('shows the attachment to the mentor, who verifies it through the normal review', async () => {
      const f1 = await login(ctx, 'f1@t.edu');
      const queue = await f1.get('/api/evidence/queue').expect(200);
      const item = queue.body.items.find((i: any) => i._id === evidenceId);
      expect(item.file.id).toBe(fileId);
      await f1.post(`/api/evidence/${evidenceId}/review`).send({ decision: 'approved' }).expect((r) => expect(r.status).toBeLessThan(300));
      const s1 = await login(ctx, 's1@t.edu');
      const skills = await s1.get(`/api/students/${fx.users.s1._id}/skills`).expect(200);
      expect(skills.body.skills.find((s: any) => s.skillId === String(fx.skills.sql._id)).verifiedLevel).toBe(3);
    });
  });

  describe('download access control', () => {
    let fileId: string;
    beforeAll(async () => {
      fileId = (await upload('s1@t.edu', PNG, 'private.png')).body.id;
    });

    it('serves the owner, their mentor, the officer and the admin', async () => {
      for (const email of ['s1@t.edu', 'f1@t.edu', 'officer@t.edu', 'admin@t.edu']) {
        const res = await (await login(ctx, email)).get(`/api/files/${fileId}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/png');
      }
    });

    it('refuses other students, a non-mentor faculty member and recruiters', async () => {
      expect((await (await login(ctx, 's2@t.edu')).get(`/api/files/${fileId}`)).status).toBe(403);
      expect((await (await login(ctx, 'f2@t.edu')).get(`/api/files/${fileId}`)).status).toBe(403);
      const r1 = await login(ctx, 'r1@acme.test', 'recruiter');
      expect([401, 403]).toContain((await r1.get(`/api/files/${fileId}`)).status);
    });

    it('sends safe headers: nosniff, sandboxed CSP, no caching, attachment for PDFs', async () => {
      const png = await (await login(ctx, 's1@t.edu')).get(`/api/files/${fileId}`);
      expect(png.headers['x-content-type-options']).toBe('nosniff');
      expect(png.headers['content-security-policy']).toContain('sandbox');
      expect(png.headers['cache-control']).toContain('no-store');
      expect(png.headers['content-disposition']).toContain('inline');
      const pdfId = (await upload('s1@t.edu', PDF, 'doc.pdf')).body.id;
      const pdf = await (await login(ctx, 's1@t.edu')).get(`/api/files/${pdfId}`);
      expect(pdf.headers['content-disposition']).toContain('attachment');
      expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('returns 404 for unknown or malformed ids', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      expect((await s1.get('/api/files/507f1f77bcf86cd799439011')).status).toBe(404);
      expect((await s1.get('/api/files/not-an-id')).status).toBe(404);
    });
  });

  describe('cleanup', () => {
    it('lets a student delete an unused upload but not one that belongs to evidence', async () => {
      const s1 = await login(ctx, 's1@t.edu');
      const unused = (await upload('s1@t.edu', PDF, 'unused.pdf')).body.id;
      expect((await s1.get('/api/files/mine/unattached').expect(200)).body.map((f: any) => f.id)).toContain(unused);
      await s1.delete(`/api/files/${unused}`).expect(200);
      expect((await s1.get(`/api/files/${unused}`)).status).toBe(404);

      const f = (await upload('s1@t.edu', PDF, 'attached.pdf')).body.id;
      const ev = await s1.post('/api/evidence').send({ type: 'certification', title: 'To withdraw', fileId: f, skills: claim() }).expect(201);
      expect((await s1.delete(`/api/files/${f}`)).status).toBe(409);
      await s1.delete(`/api/evidence/${ev.body._id}`).expect(200);
      expect((await s1.get(`/api/files/${f}`)).status).toBe(404); // withdrawn evidence takes its file with it
    });

    it('keeps another student from deleting someone else\'s upload', async () => {
      const f = (await upload('s1@t.edu', PDF, 'mine.pdf')).body.id;
      expect((await (await login(ctx, 's2@t.edu')).delete(`/api/files/${f}`)).status).toBe(404);
    });
  });
});
