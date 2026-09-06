# NTS LMS Technical Specification

## Production Infrastructure

- Host: Hostinger VPS `srv1959247.hstgr.cloud` at `187.127.136.176`, Mumbai, with 2 vCPUs, 8 GB RAM, and 100 GB disk, running Ubuntu 24.04.
- Deployment: Coolify manages the application and services.
- Coolify project/environment: `nts-lms` / `production`.
- Application resource: `nts-lms-app`, to be created.
- Source: repository `nts-lms`, branch `main`, through the connected GitHub App source `nts-lms-github`.
- Deploys: pushes to `main` trigger an automatic Coolify build and deploy using the Nixpacks build pack.
- Coolify panel: `http://187.127.136.176:8000/`.
- Production URL: pending customer domain.
- Health check: implement `/api/health`; it must query PostgreSQL and return HTTP 200 only when the application can reach the database.

## PostgreSQL

- Coolify service: `postgresql-database-nts-lms-db`.
- Image: `postgres:17-alpine`.
- Internal hostname: `rzqdhogoeqadib95ishvkwd0`.
- Port: `5432` on the internal Docker network only; it must not be publicly exposed.
- Database: `postgres`.
- Username: `postgres`.
- Production connection: configure `DATABASE_URL` in Coolify before the first application deploy. Never commit the value or its password.
- Auth configuration: configure a unique `BETTER_AUTH_SECRET` and the production `BETTER_AUTH_URL` in Coolify before enabling production authentication.
- Production data is currently empty. Destructive migrations are acceptable until content is loaded around 12 September 2026.

## Cloudflare R2

- Bucket: `nts-lms-content`.
- Account ID: `11644e77364f0ced57d6cbcee03d005e`.
- Endpoint: `https://11644e77364f0ced57d6cbcee03d005e.r2.cloudflarestorage.com`.
- Region: `auto`.
- Configure these production variables in Coolify: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`.
- The Coolify snapshot confirms the production database, Better Auth, and R2 variables are enabled for both buildtime and runtime. Preview has corresponding variables configured separately.
- Object keys:
  - `chapters/{chapterId}/notes/{uuid}-{filename}`
  - `submissions/{userId}/{chapterId}/{uuid}-{filename}`
- Never expose bucket paths to clients. All access must use short-lived server-generated presigned URLs after an ownership check.

## Email and Domain

- DNS provider: Cloudflare.
- Domain and DNS-to-VPS status: pending customer confirmation.
- Email provider: Brevo API, not SMTP.
- Sender domain: pending verification.
- Production variable: `BREVO_API_KEY` in Coolify.
- Brevo is intentionally deferred and is not required for the current deployment checkpoint.
- Required templates: invitation, password reset, and later chapter unlocked. Implement the templates in the repository rather than relying on Brevo's template UI.

## Backups

- Coolify manages daily database backups to the Cloudflare R2 destination `r2-backups`.
- Retention: 7 local days and 30 days on S3.
- Restore: use Coolify's built-in restore. Do not implement backup or restore logic in the application.
- Alerts: Coolify notifications.

## Data Model

The initial migration defines the NTS LMS schema before organization-scoped screens are built. The 14 tables are:

- `organizations`, `users`, and `invitations` for identity and tenancy (spec §4).
- `courses` and `chapters` for curriculum structure (spec §4).
- `question_sets`, `questions`, `attempts`, and `responses` for assessments (spec §4).
- `analysis_bands` and `analyses` for psychometric results (spec §4).
- `progress` for chapter completion (spec §4).
- `setup_answers` for the setup questionnaire (spec §4 and onboarding requirements).
- `course_settings` for sequencing, pass marks, and retake settings (spec §4 and admin settings requirements).

There is intentionally no `components`, `user_module_state`, `module_scores`, `enrollments`, `submissions`, `tracker_entries`, or `practice_notes` table. Those belong to the superseded Playbook architecture or out-of-scope execution and reporting work. No execution trackers, practice notes, rubric reports, or module-score model is part of this build.

Open decision: confirm with the trainer whether chapter deliverables must support learner file uploads that a trainer can view. Grading remains out of scope, but a confirmed upload requirement would add a narrowly scoped `submissions` table and R2 file flow before content is loaded. Do not add it until confirmed.

User-facing records that require direct tenancy filtering carry `organization_id`; user-owned records also retain `user_id` for learner-level scope. All organization-scoped queries must use the shared Drizzle scope helper derived from the authenticated session.

## Constraints and Development Workflow

- The app and PostgreSQL share the same 8 GB VPS. Do not add Redis or any other service without explicit approval.
- If Next.js builds become memory-heavy, report the issue rather than silently adding workarounds or infrastructure.
- Local development uses Docker Postgres.
- Run and verify migrations locally first, then run `npm run db:migrate` in production during deployment.
- Production environment variables belong in Coolify, not in a committed `.env` file.
