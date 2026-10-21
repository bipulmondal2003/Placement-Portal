# Architecture

```
Browser ──► Next.js (apps/web) ──/api/* rewrite──► NestJS API (apps/api) ──► MongoDB
                                                       │  ▲
                                                       ▼  │
                                                     Redis ◄── BullMQ worker (apps/api/src/worker.ts)
                                                       │
                                                       └── cache, rate limiting, queues
                                                  API ──► Gemini (optional, advisory only)
```

## Why the browser only talks to the web origin

Next.js proxies `/api/*` to the API. Session cookies are therefore first-party, `SameSite` can stay strict where it matters, and the API's CSRF check (the `Origin` header must be the configured `FRONTEND_URL`) works without CORS gymnastics.

## Backend modules

`auth`, `users`, `students`, `skills`, `drives`, `evidence`, `assessments`, `readiness`, `plans`, `ai`, `recruiter`, `reports`, `queues`, `system-config`, `audit`, `redis`, `health`. The readiness module is global because students, evidence and assessments all trigger recalculation.

## Authentication and authorisation

- Passwords are hashed with argon2id.
- Two cookies: `prp_session` (SameSite=lax, normal lifetime) and `prp_recruiter_session` (SameSite=strict, 30 minutes, separate audience). A student cookie is not accepted on recruiter routes and vice versa.
- Each user carries a `tokenVersion`. Password change, role change and deactivation bump it, which invalidates every existing token.
- Global guards run in order: rate limiter, JWT, roles. Every controller route declares its roles; the UI hiding a link is a convenience, never the control.
- Row-level rules live in services (a faculty member sees only their mentees; students only their own data; nobody reviews their own evidence).

## Readiness pipeline

1. A student profile, evidence decision, assessment result or admin setting changes.
2. The API asks `JobsService` for a **debounced** recalculation for that student (trailing-edge, one job per student, default 3 s). If Redis is down it falls back to inline computation.
3. The worker builds the student's skill profile (verified levels, evidence strength), evaluates every relevant drive with the pure engine, and writes a `ReadinessSnapshot` only when the `inputsHash` changed, so reruns are idempotent.
4. Officers can start a **batch** recalculation (queue `batch-readiness`) for all drives or a drive/department/batch. Progress is stored on a `BatchJob` and polled by the UI. Identical in-flight batches are de-duplicated by a partial unique index.

Queues: `readiness`, `batch-readiness`, `ai-tasks` (prefix `prp`).

## Caching

Redis caches the skill taxonomy and report aggregates under a namespaced, versioned key. Writers call `invalidate()`, which bumps the namespace version, so a reseed or taxonomy edit cannot serve stale names.

## AI boundary

`AiService` wraps `@google/genai` with a timeout and typed errors (`AI_DISABLED`, `AI_NOT_CONFIGURED`, `AI_AUTH_FAILED`, `AI_MODEL_UNAVAILABLE`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_NETWORK`, `AI_PROVIDER_ERROR`, `AI_EMPTY_RESPONSE`, `AI_INVALID_OUTPUT`, `AI_BLOCKED`). User text is wrapped in delimiters and declared as data in the system prompt. Structured outputs are validated against a schema; invalid output is discarded rather than shown. AI code paths receive scores and gaps as read-only context and have no write access to them. Resume-extracted skills become ordinary *pending* evidence claims.

## Frontend

App Router with route groups: `(app)` for signed-in role pages inside a shared shell, `(public)` for the landing page, and a separate `recruiter/(portal)` shell with its own minimal chrome. Data loading uses SWR with explicit loading, empty and error states. The signature component is `EvidenceBar`: a solid fill for verified level, a hatched fill for claimed-but-unverified, and a tick for the level the drive requires, so the three facts never blur together.
