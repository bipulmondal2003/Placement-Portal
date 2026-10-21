import { defineConfig } from '@playwright/test';

/**
 * E2E tests run against a live stack (web + API + MongoDB + Redis) that has been seeded with `npm run seed -w apps/api`.
 * Start it first (see README), then: npm run test:e2e -w apps/web
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
});
