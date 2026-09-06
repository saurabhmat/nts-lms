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
- Required templates: invitation, password reset, and later chapter unlocked. Implement the templates in the repository rather than relying on Brevo's template UI.

## Backups

- Coolify manages daily database backups to the Cloudflare R2 destination `r2-backups`.
- Retention: 7 local days and 30 days on S3.
- Restore: use Coolify's built-in restore. Do not implement backup or restore logic in the application.
- Alerts: Coolify notifications.

## Constraints and Development Workflow

- The app and PostgreSQL share the same 8 GB VPS. Do not add Redis or any other service without explicit approval.
- If Next.js builds become memory-heavy, report the issue rather than silently adding workarounds or infrastructure.
- Local development uses Docker Postgres.
- Run and verify migrations locally first, then run `npm run db:migrate` in production during deployment.
- Production environment variables belong in Coolify, not in a committed `.env` file.
