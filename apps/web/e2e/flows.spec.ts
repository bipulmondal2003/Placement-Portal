import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'Demo@12345';

async function login(page: Page, email: string, portal: 'main' | 'recruiter' = 'main') {
  await page.goto(portal === 'main' ? '/login' : '/recruiter/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
}

test.describe('access control', () => {
  test('signed-out visitors are sent to the login page', async ({ page }) => {
    await page.goto('/student');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a student cannot use officer pages', async ({ page }) => {
    await login(page, 'student01@demo.edu');
    await page.goto('/officer');
    await expect(page.getByRole('heading', { name: 'Placement overview' })).toHaveCount(0);
    const res = await page.request.get('/api/dashboards/officer');
    expect(res.status()).toBe(403);
  });

  test('wrong password shows an error and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('student01@demo.edu');
    await page.getByLabel(/password/i).fill('not-the-password-1');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /./ })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('evidence flow: claim, review, verified', () => {
  const title = `E2E project ${Date.now()}`;
  let mentorEmail = '';

  test('student submits evidence and sees it pending', async ({ page }) => {
    await login(page, 'student01@demo.edu');
    const me = await (await page.request.get('/api/auth/me')).json();
    const profile = await (await page.request.get(`/api/students/${me.id}/profile`)).json();
    mentorEmail = profile.mentor.email;

    await page.goto('/student/evidence');
    await page.getByRole('button', { name: 'Add evidence' }).first().click();
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('What did you do?').fill('Built and deployed it end to end for the e2e test.');
    await page.getByLabel('Add a skill').fill('react');
    await page.getByRole('button', { name: /React/ }).first().click();
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.locator('li', { hasText: title }).getByText('Pending review')).toBeVisible();
  });

  test('mentor approves it and the student then sees it verified', async ({ page }) => {
    test.skip(!mentorEmail, 'previous step did not run');
    await login(page, mentorEmail);
    await page.goto('/faculty/reviews');
    // The queue is paginated; page through until the new item shows up.
    const row = page.locator('li', { hasText: title });
    for (let i = 0; i < 30 && (await row.count()) === 0; i++) {
      const next = page.getByRole('button', { name: 'Next page' });
      if (!(await next.isEnabled())) break;
      await next.click();
      await page.waitForTimeout(300);
    }
    await row.getByRole('button', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(title)).toHaveCount(0);

    await page.context().clearCookies();
    await login(page, 'student01@demo.edu');
    await page.goto('/student/evidence');
    await expect(page.locator('li', { hasText: title }).getByText('Verified')).toBeVisible();
  });
});

test.describe('recruiter privacy', () => {
  test('a recruiter with a grant sees only released fields and no contact details', async ({ page }) => {
    await login(page, 'recruiter@acme.demo', 'recruiter');
    await expect(page).toHaveURL(/\/recruiter$/);
    await page.getByRole('link', { name: /Acme Tech/ }).first().click();
    await expect(page.getByText(/candidates? match/)).toBeVisible();
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/@demo\.edu/);
    const list = await (await page.request.get('/api/recruiter/drives')).json();
    const res = await (await page.request.get(`/api/recruiter/drives/${list[0].driveId}/candidates`)).json();
    for (const c of res.items) {
      expect(c).not.toHaveProperty('email');
      expect(c).not.toHaveProperty('phone');
      expect(c).not.toHaveProperty('user');
    }
  });

  test('a recruiter without a grant sees an empty state and is denied the API', async ({ page }) => {
    await login(page, 'recruiter@nogrant.demo', 'recruiter');
    await expect(page.getByText('No active access')).toBeVisible();
    const res = await page.request.get('/api/recruiter/drives/000000000000000000000000/candidates');
    expect([403, 404]).toContain(res.status());
  });

  test('a student session cannot call the recruiter API', async ({ page }) => {
    await login(page, 'student01@demo.edu');
    const res = await page.request.get('/api/recruiter/drives');
    // The recruiter portal has its own session cookie, so a student session is simply not authenticated there.
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('drive registration', () => {
  test('an eligible student sees separate eligibility and readiness panels', async ({ page }) => {
    await login(page, 'student01@demo.edu');
    await page.goto('/student/drives');
    await page.getByRole('link').filter({ hasText: /Acme Tech/ }).first().click();
    await expect(page.getByText('Eligibility', { exact: true })).toBeVisible();
    await expect(page.getByText('Readiness', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Skill by skill')).toBeVisible();
  });
});
