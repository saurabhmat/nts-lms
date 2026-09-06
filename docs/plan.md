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

- [ ] Start local Docker Postgres and run migrations locally.
- [ ] Verify schema, tests, seed data, and a clean local boot before deployment.
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

- [ ] Start local Docker Postgres and apply the 12-table migration before adding organization-scoped admin queries.
- [ ] Implement master organization list/create/detail flows through the shared session-derived scope boundary.
- [ ] Implement company-admin learner roster and organization membership checks.
- [ ] Implement invitation creation, expiry, acceptance, resend, and duplicate handling.
- [ ] Add tests for company A/B isolation across organization and learner queries.

Current blocker: Docker, Podman, Colima, `psql`, and a local PostgreSQL listener are unavailable in this environment, so the migration has not been run locally.
