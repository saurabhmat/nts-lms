# NTS LMS Delivery Plan

## Infrastructure Readiness

- [x] Create the Coolify project resource `nts-lms-app` in the `production` environment.
- [x] Connect the `nts-lms-github` GitHub App source to repository `nts-lms`, branch `main`.
- [x] Confirm Nixpacks auto-detects the Next.js app and monitor build memory on the shared 8 GB VPS.
- [x] Configure `DATABASE_URL` using the private PostgreSQL service `postgresql-database-nts-lms-db` at internal hostname `rzqdhogoeqadib95ishvkwd0`, database `postgres`, user `postgres`, port `5432`.
- [x] Configure a unique `BETTER_AUTH_SECRET` and the final `BETTER_AUTH_URL` in Coolify before the first production deploy.
- [x] Configure `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` for bucket `nts-lms-content`.
- [ ] Configure `BREVO_API_KEY` in Coolify later when Brevo is ready. Do not commit production secrets or create a production `.env` file.
- [ ] Configure the production domain after the customer provides it, then set Cloudflare DNS, SSL, secure cookies, and allowed origins.

## Application Requirements

- [x] Build `/api/health` to query PostgreSQL and return HTTP 200 only when the database is reachable.
- [ ] Use R2 object keys `chapters/{chapterId}/notes/{uuid}-{filename}` and `submissions/{userId}/{chapterId}/{uuid}-{filename}`.
- [ ] Generate short-lived presigned URLs server-side only after ownership checks; never expose bucket paths to clients.
- [ ] Implement Brevo invitation, password-reset, and later chapter-unlocked templates in the repository.
- [ ] Do not add Redis or any other service without explicit approval.

## Migration and Deployment Workflow

- [x] Run local Postgres and apply migrations locally. Docker/Podman/Colima remain unavailable in this environment; used Homebrew `postgresql@17` instead (database `nts_lms`, connected via `.env.local`). `drizzle-kit check` reports no drift and all 18 tables (11 public + 7 `auth`) exist.
- [x] Verify schema, tests, and a clean local boot before deployment. `npm test` passes (8/8 org-isolation tests); `npm run dev` boots and `/api/health` returns 200 against the local database. Seed data still outstanding — no seed script exists yet.
- [ ] Add `npm run db:migrate` to the Coolify build/pre-deploy migration step.
- [x] Deploy by pushing verified changes to `main`; Coolify builds and deploys automatically.
- [ ] Run production migrations only after local verification. Production is currently empty, so destructive migrations are acceptable until content is loaded around 12 September 2026.
- [ ] Smoke-test login, database health, R2 uploads/downloads, presigned URL ownership, email flows, and the production deployment.

## Backup and Operations

- [x] Verify Coolify's existing daily database backup to `r2-backups`, with 7 local days and 30 S3 days retention.
- [ ] Verify the Coolify restore procedure and notifications. Do not build an application backup or restore mechanism.
- [ ] Record the customer domain, DNS status, and verified Brevo sender domain when supplied; the Coolify panel URL is `http://187.127.136.176:8000/`.

## Foundation

- [x] Define the complete LMS model before organization-scoped screens: 14 conceptual LMS tables, with 11 public tables and identity tables owned by Better Auth, plus its 7 auth tables.
- [x] Add one shared Drizzle organization-scope helper derived from the session and use it for organization filtering.
- [x] Add a test proving an organization-scoped query for company A cannot include company B's rows.
- [x] Make `auth.members` the sole membership source, enforce one membership per user, and support master and individual learner paths.
- [x] Add `attempts.current_question_index` for resumable assessment state.
- [x] Generate Better Auth's 7-table schema in the dedicated PostgreSQL `auth` schema.
- [x] Run and verify the generated migration against local Docker Postgres before production migration.

## Admin & Identity (next group)

- [x] Local Postgres is running with the migration applied (18 tables); organization-scoped admin queries can now be built against it.
- [x] Implement master organization list/create/detail flows through the shared session-derived scope boundary. `/admin/companies` (list + create) and `/admin/companies/[orgId]` (detail + roster + bulk-invite) are built as Server Components backed by `lib/admin/companies.ts`, gated by `app/admin/layout.tsx` (redirects to `/login` or `/403`). Company creation and invitations write directly via Drizzle rather than Better Auth's `organization` plugin endpoints, because that plugin always adds the creator/inviter as an `auth.members` row — which would violate the one-membership-per-user rule and the "master has no membership row" design rule the schema already enforces.
- [ ] Implement company-admin learner roster and organization membership checks. Deferred: `/team/*` routes for the `company_admin` role are not built yet.
- [x] Implement invitation creation and duplicate handling (an email already a member, or with a pending invite, is skipped and reported). Deferred: expiry sweep/cleanup, resend, and the `/invite/[token]` acceptance page are not built yet — invitations are created with a 7-day expiry but nothing currently consumes them.
- [x] Add tests for company A/B isolation across organization and learner queries. `lib/admin/companies.test.ts` is a live-database integration suite (seeds two orgs directly, asserts a roster query never crosses organizations, and that invitation dedupe is scoped per-organization).

Also fixed while unblocking this group: added a seed script (`npm run db:seed`, `db/seed.ts`) to create/promote a local master user, since email/password auth had never actually been exercised end-to-end before. That surfaced two more pre-existing gaps, now fixed: (1) the installed Better Auth version requires an `issuer` column on `auth.accounts` that the schema was missing (migration `0002_lazy_shocker.sql`, safe since the table was empty); (2) `drizzle.config.ts` loaded `.env` via `dotenv/config`, but this project only has `.env.local`, so `npm run db:migrate`/`db:seed` never actually had `DATABASE_URL` when run standalone — fixed to load `.env.local` explicitly. The whole flow was verified against the real local Postgres via the actual HTTP wire protocol (sign-in, both admin pages, real form submissions including the no-JS server-action fallback), not just unit tests.

Resolved: Docker, Podman, and Colima remain unavailable, but Homebrew's `postgresql@17` service is installed and running locally, with `psql` available. The `nts_lms` database was created and both migrations applied against it — schema, tests, and a local boot are all verified.
