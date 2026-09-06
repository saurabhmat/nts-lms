# NTS LMS Delivery Plan

## Infrastructure Readiness

- [ ] Create the Coolify project resource `nts-lms-app` in the `production` environment.
- [ ] Connect the `nts-lms-github` GitHub App source to repository `nts-lms`, branch `main`.
- [ ] Confirm Nixpacks auto-detects the Next.js app and monitor build memory on the shared 8 GB VPS.
- [ ] Configure `DATABASE_URL` using the private PostgreSQL service `postgresql-database-nts-lms-db` at internal hostname `rzqdhogoeqadib95ishvkwd0`, database `postgres`, user `postgres`, port `5432`.
- [ ] Configure a unique `BETTER_AUTH_SECRET` and the final `BETTER_AUTH_URL` in Coolify before the first production deploy.
- [ ] Configure `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` for bucket `nts-lms-content`.
- [ ] Configure `BREVO_API_KEY` in Coolify. Do not commit production secrets or create a production `.env` file.
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
- [ ] Deploy by pushing verified changes to `main`; Coolify builds and deploys automatically.
- [ ] Run production migrations only after local verification. Production is currently empty, so destructive migrations are acceptable until content is loaded around 12 September 2026.
- [ ] Smoke-test login, database health, R2 uploads/downloads, presigned URL ownership, email flows, and the production deployment.

## Backup and Operations

- [ ] Verify Coolify's existing daily database backup to `r2-backups`, with 7 local days and 30 S3 days retention.
- [ ] Verify the Coolify restore procedure and notifications. Do not build an application backup or restore mechanism.
- [ ] Record the customer domain, DNS status, and verified Brevo sender domain when supplied; the Coolify panel URL is `http://187.127.136.176:8000/`.
