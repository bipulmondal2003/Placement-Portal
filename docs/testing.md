# Testing and verification status

## What exists

| Layer | Where | Count |
|---|---|---|
| Engine unit tests (eligibility, readiness, hashing) | `apps/api/src/readiness/engines.spec.ts` | 19 |
| API integration tests (Supertest) | `apps/api/test/*.spec.ts`: auth and RBAC, evidence and readiness, recruiter privacy, partial updates, queues and cache, AI (stubbed provider and not-configured), throttling | 128 |
| Browser E2E (Playwright) | `apps/web/e2e/flows.spec.ts` | 9 |

Each integration file boots one real Nest application against a real database and Redis. The Gemini client is replaced through a `GENAI_CLIENT` provider, so AI paths are tested without network access.

## What was actually run (last run in the build environment)

- API: `jest --runInBand` → 9 suites, 147 tests passed.
- Playwright: 9 tests passed against `next start` + the API + seeded data.
- `tsc --noEmit` (web, API) clean; `eslint` 0 errors (API: 25 warnings, mostly unused directives); `next build` and `nest build` succeeded.
- Every role's pages were loaded in headless Chromium with no console errors or failing API calls; the drive match page was checked at 390 px width in dark mode with no horizontal overflow.

## What was **not** verified here

- **Real MongoDB.** The sandbox could not download MongoDB, so tests ran against FerretDB 1.24 (SQLite backend). Queries were written to avoid FerretDB gaps (`$first`, `$avg`, `$max`, findAndModify projection), but run `npm test` against real MongoDB 7 to confirm: `TEST_MONGODB_URI=mongodb://localhost:27017 npm test`.
- **Docker.** No Docker daemon was available. `docker compose config` validates, and the web standalone output was run directly, but the images were never built here. Verify with `docker compose up --build`.
- **Live Gemini.** No API key was available. Provider behaviour is covered only through the stubbed client. Verify with a real key and the AI pages. The default model name in `.env.example` should be checked against Google's current list.
- **Load, penetration and accessibility audits** were not performed. Semantic labels, focus states and chart text alternatives were built in, but no screen-reader pass was done.
