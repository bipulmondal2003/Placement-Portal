# Placement Skill Matcher & Readiness Analyser

An evidence-based placement readiness and skill-gap platform for a college placement cell. Students see exactly how ready they are for each drive and why; faculty verify the evidence behind every claim; the placement cell sees supply versus demand across the cohort; recruiters see only what they have been explicitly granted.

The design rule that shapes everything: **eligibility, readiness and AI are three separate things.**

| | What it is | Who decides |
|---|---|---|
| **Eligibility** | Pass/fail rules (CGPA, department, backlogs, batch). | Fixed rules set per drive. Never scored, never AI. |
| **Readiness** | A 0 to 100 score from *verified* skill levels against a drive's requirements. | A deterministic engine. Self-reported levels and pending evidence earn nothing. |
| **AI (Gemini)** | Explains, plans, drafts feedback and extracts claims from a resume. | Advisory only. It cannot change a score, a gap or a verified skill. |

## What is in the box

- **Students**: dashboard, drive match view (eligibility and readiness side by side), skills with a verified / claimed / required bar, evidence submission, assessments, preparation plans (rule-based or AI-drafted and reviewed before saving), AI assistant, profile.
- **Faculty**: evidence review queue (award a level per skill, comment required on rejection), mentee progress, assessment builder with results, mock-interview recording.
- **Placement officer / head**: drive builder (requirements, eligibility rule, registrations), student records and mentor assignment, reports (supply vs demand, common gaps, verification coverage, funnel, trends), batch recalculation with live progress, recruiter grants and access log. The head also has a leadership view and may release contact fields.
- **Recruiters**: a separate portal and session. Time-boxed, drive-scoped, field-level access with a hard result cap, no export, every request logged.
- **Admin**: users and roles, skill taxonomy (synonyms, clusters, merge), scoring weights and switches, system health, access log.

## Stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind, Radix primitives (shadcn-style components), Lucide, Recharts · NestJS 11, Mongoose, class-validator, Swagger · MongoDB 7 · Redis 7 with BullMQ · Google Gemini through `@google/genai` · Jest + Supertest, Playwright.

## Quick start (local, without Docker)

Requirements: Node 20+ (22 recommended), a MongoDB 7 instance and a Redis 7 instance.

```bash
cp .env.example .env            # then set JWT_SECRET (see the comment in the file)
npm install
npm run seed                    # demo data; add `-- --reset` to wipe and reseed
npm run dev:api                 # http://localhost:4000/api  (Swagger: /api/docs)
npm run dev:web                 # http://localhost:3000
```

In development the API runs the queue worker in-process (`EMBED_WORKER=true`). To run it separately: `npm run dev:worker`.

## Quick start (Docker Compose)

```bash
cp .env.example .env            # set JWT_SECRET
docker compose up --build
docker compose run --rm -e ALLOW_SEED_IN_PRODUCTION=true api node dist/seed/seed.js
```

Open http://localhost:3000. Compose starts MongoDB, Redis, the API, a separate worker and the web app. The web image bakes the `/api` proxy target (`http://api:4000`) in at build time.

## Demo accounts

All demo accounts use the password `Demo@12345`. They exist only after seeding. **Change or remove them before any real deployment.**

| Role | Sign in at | Email |
|---|---|---|
| Student | `/login` | `student01@demo.edu` … `student60@demo.edu` |
| Faculty | `/login` | `faculty1@demo.edu`, `faculty2@demo.edu` |
| Placement officer | `/login` | `officer@demo.edu` |
| Placement head | `/login` | `head@demo.edu` |
| Admin | `/login` | `admin@demo.edu` |
| Recruiter (with grants) | `/recruiter/login` | `recruiter@acme.demo`, `recruiter@globex.demo` |
| Recruiter (no grant) | `/recruiter/login` | `recruiter@nogrant.demo` |

Seeded data: 60 students across departments and batches, 75 skills in 9 clusters for three role families (software development, data, testing), five drives (three published, one completed, one draft), assessments, evidence in every state, mock interviews, plans, registrations, readiness snapshots computed by the real engine, and recruiter grants (two active, one expired).

## Gemini (optional)

Everything except the AI features works with no key. To enable them, set `GEMINI_API_KEY` (from Google AI Studio) and check `GEMINI_MODEL` against Google's current model list, since availability varies by account. Without a key the AI endpoints return a typed `AI_NOT_CONFIGURED` error and the UI says so plainly. The administrator can also switch AI off in Scoring and settings.

## Tests and checks

```bash
npm test                        # API: unit + integration (Jest, Supertest)
npm run lint                    # ESLint, API and web
npm run build                   # production builds
npm run typecheck -w apps/web
npm run test:e2e -w apps/web    # Playwright, needs the stack running and seeded
```

Integration tests use `mongodb-memory-server` by default. If it cannot download a MongoDB binary (offline machines), point them at any running MongoDB: `TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test`. Redis is read from `TEST_REDIS_URL` (default `redis://127.0.0.1:6390/15`). Playwright takes `E2E_BASE_URL` and optionally `PLAYWRIGHT_CHROMIUM_PATH`.

## Documentation

- [docs/architecture.md](docs/architecture.md): components, request flow, auth, queues and caching
- [docs/database.md](docs/database.md): collections, indexes and key fields
- [docs/readiness-model.md](docs/readiness-model.md): the exact eligibility and readiness rules
- [docs/data-release-policy.md](docs/data-release-policy.md): recruiter access and privacy controls
- [docs/testing.md](docs/testing.md): what is tested, how, and what was and was not verified
- [docs/known-limitations.md](docs/known-limitations.md): honest list of gaps and trade-offs

## Repository layout

```
apps/api     NestJS API, worker, seed, tests
apps/web     Next.js app, Playwright tests
docs/        design and policy documents
docker-compose.yml, .env.example
```

## Security notes

httpOnly session cookies (recruiters get a separate, stricter one), argon2id password hashing, CSRF origin checks, role guards on every route, rate limits, input validation on every body, and an audit log for administrative changes. No secrets are committed; `.env` is git-ignored.
