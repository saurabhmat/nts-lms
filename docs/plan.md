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

## Trainer registration, team admins, and password reset (out-of-spec addition, explicitly requested)

Not in the original spec (§5 lists no `/register` and no team-admin concept), but the trainer asked for this directly rather than deferring it:

- [x] `/register` — a standing public page (always reachable, not first-run-gated) that creates a `master`-role account. Gated by a shared `REGISTRATION_CODE` env var checked server-side, since this mints full-admin accounts — see `.env.example` for the security note. No new role was added; "super admin" teammates are just additional `master` rows, per explicit choice over adding a `super_admin` role.
- [x] `/admin/team` — master-only page listing existing admins and pending invitations, with a bulk-invite-by-email form. Invitations live in a new `admin_invitations` table (`db/schema.ts`, migration `0003_stale_union_jack.sql`), deliberately separate from Better Auth's `auth.invitations` — that table and its `acceptInvitation` flow are organization-scoped by design, and a master admin has no organization.
- [x] `/admin-invite/[token]` — public accept page for a team-admin invite: sets name/password, creates the account via `auth.api.signUpEmail`, promotes to `master`, marks the invitation accepted.
- [x] `/forgot-password` and `/reset-password/[token]` (already listed in spec §5, not previously built). `lib/auth.ts` now wires `emailAndPassword.sendResetPassword`, but since Brevo isn't configured yet, it currently just logs the reset link to the server console instead of emailing it — swap in a real send once `BREVO_API_KEY` is live. Note: Better Auth's own generated reset URL points at its internal `/api/auth/reset-password/:token` redirect-hop endpoint, not our page directly, so `sendResetPassword` builds its own URL from the raw `token` instead of using the provided `url`.
- [x] `lib/admin/team.ts` + `lib/admin/team.test.ts` — invite dedupe (already-admin / already-pending), non-master rejection, and accept-then-promote, all against the real local database.

All four flows (register with a wrong/right code, team invite → accept → promotion, forgot-password → reset → new password works / old one doesn't) were verified against local Postgres via the real HTTP wire protocol, not just unit tests.

## Closing the company-learner invitation loop, and a real company-admin view

Another deliberate deviation from spec §2, requested directly: spec originally scoped `company_admin` as "read-only over learners in their own organisation." That's now expanded so a company admin can invite their own learners too.

- [x] `/invite/[token]` — company learners can now actually accept an invitation (previously only the row existed; nothing consumed it). Writes the `auth.members` row directly rather than calling `auth.api.acceptInvitation`, for the same reason described below.
- [x] `/team` — real company_admin view: own org's roster, pending invitations, and an invite-learners form. Uses `organizationUserWhere` from `lib/db/org-scope.ts` in real code for the first time (previously only exercised by its own unit tests) — proven with a live-database isolation test (`lib/team/roster.test.ts`) that a company admin can never see another company's learners.
- [x] Master can now invite someone directly as a company owner (`inviteCompanyOwner` in `lib/admin/companies.ts`) rather than the old invite-as-learner-then-manually-promote path. The intended role rides on `authInvitations.role` (repurposed to carry our application role rather than Better Auth's org-role concept, since we already bypass that system) and is applied on acceptance in `lib/invitations.ts`.
- [x] A company admin can invite further learners into their own org from `/team` (`inviteLearnersIntoMyOrganization` in `lib/team/roster.ts`) — but can **never** invite another company_admin: that function hardcodes the role to `"learner"`, with a dedicated test (`lib/team/roster.test.ts`) asserting the invitation row it creates is never anything else. Privilege escalation here would mean a company admin minting peer admins for their own org unchecked — deliberately not exposed.
- [x] Added the master-only promote/demote toggle on `/admin/companies/[orgId]`'s roster (`setMemberApplicationRole`) that this whole loop depends on — there was previously no way to create a `company_admin` account at all.
- [x] Login now redirects `company_admin` to `/team` (previously fell through to the bare homepage, since `/team` didn't exist yet).

Two more bugs found and fixed while wiring this up:
1. `db/index.ts`'s `getDb()` opened a brand-new Postgres connection pool on every call instead of reusing one. Fine with few callers, but with more lib modules now calling it repeatedly across a test run, it exhausted Postgres's connection limit (had to `brew services restart postgresql@17` to recover). Fixed to a lazy module-level singleton.
2. The company-invite accept action originally chained `auth.api.signUpEmail` then `auth.api.acceptInvitation`, both via `headers()` — same root cause as the earlier login-redirect bug: the second call can't see the session the first one just created, since the new cookie is only on the outgoing response. Fixed by writing the `auth.members` row directly instead, matching how the admin-invite flow already worked.

All of the above (invite-owner → accept → auto-promoted to company_admin; owner invites a learner from `/team` → accept; access boundaries in both directions) was verified against local Postgres via the real HTTP wire protocol, alongside the automated integration tests.
