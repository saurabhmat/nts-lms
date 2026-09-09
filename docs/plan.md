# NTS LMS Delivery Plan

## Infrastructure Readiness

- [x] Create the Coolify project resource `nts-lms-app` in the `production` environment.
- [x] Connect the `nts-lms-github` GitHub App source to repository `nts-lms`, branch `main`.
- [x] Confirm Nixpacks auto-detects the Next.js app and monitor build memory on the shared 8 GB VPS.
- [x] Configure `DATABASE_URL` using the private PostgreSQL service `postgresql-database-nts-lms-db` at internal hostname `rzqdhogoeqadib95ishvkwd0`, database `postgres`, user `postgres`, port `5432`.
- [x] Configure a unique `BETTER_AUTH_SECRET` and the final `BETTER_AUTH_URL` in Coolify before the first production deploy.
- [x] Configure `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` for bucket `nts-lms-content`.
- [ ] Configure `BREVO_API_KEY` in Coolify later when Brevo is ready. Do not commit production secrets or create a production `.env` file.
- [x] Configure the production domain and DNS/SSL. `https://sales.ntswithankit.com` is live, serving a valid certificate, with `/api/health` returning ok (verified 8 September 2026).
- [ ] Confirm secure cookies and Better Auth allowed origins for `sales.ntswithankit.com`. `BETTER_AUTH_URL` must match the public HTTPS origin exactly, or sign-in sets a cookie the browser will not send back.

## Application Requirements

- [x] Build `/api/health` to query PostgreSQL and return HTTP 200 only when the database is reachable.
- [x] Use R2 object keys `chapters/{chapterId}/notes/{uuid}-{filename}` and `submissions/{userId}/{chapterId}/{uuid}-{filename}`. Both key builders live in `lib/r2.ts`.
- [x] Generate short-lived presigned URLs server-side only after ownership checks; never expose bucket paths to clients. `lib/r2.ts` presigns for 300 seconds and is only ever called from server code behind a role check (`getChapterNotesUrl`). Verified against the live `nts-lms-content` bucket on 9 September 2026.
- [x] Implement Brevo invitation and password-reset templates in the repository (`lib/email.ts`). The chapter-unlocked template is still outstanding. The password-reset template was sent through a real Brevo account to a live inbox on 9 September 2026; the invitation template has been rendered but not yet sent end to end.
- [ ] Do not add Redis or any other service without explicit approval.

## Migration and Deployment Workflow

- [x] Run local Postgres and apply migrations locally. Docker/Podman/Colima remain unavailable in this environment; used Homebrew `postgresql@17` instead (database `nts_lms`, connected via `.env.local`). `drizzle-kit check` reports no drift and all 18 tables (11 public + 7 `auth`) exist.
- [x] Verify schema, tests, and a clean local boot before deployment. `npm test` passes (8/8 org-isolation tests); `npm run dev` boots and `/api/health` returns 200 against the local database. Seed data still outstanding — no seed script exists yet.
- [x] Provide a production-safe migration command. `npm run db:migrate:prod` (`node db/migrate.mjs`) uses only runtime dependencies; `npm run db:migrate` cannot run in production because drizzle-kit and tsx are devDependencies and get pruned. Verified by migrating an empty database from scratch to all 19 tables, and by running it again as a no-op.
- [x] **Set `npm run db:migrate:prod` as the Coolify pre-deployment command.** Configured in the Coolify panel by the operator on 9 September 2026, followed by a successful redeploy: the site came back up, `/api/health` returns `{"status":"ok"}` and sign-in works. Migrations were already applied, so this first run was a deliberate no-op — the safest possible way to prove the wiring. Not directly observed from this environment: the build log line confirming the pre-deploy step ran. If it had failed it would have exited non-zero and aborted the deploy, so a green deploy is strong but indirect evidence.
- [x] Deploy by pushing verified changes to `main`; Coolify builds and deploys automatically.
- [x] Run production migrations only after local verification. Verified applied in production on 8 September 2026 (`npm run db:migrate` inside the running container reported "migrations applied successfully", and the `drizzle` journal already existed, so migrations had been applied before that too). `/api/health` returns `{"status":"ok"}`, confirming the app reaches the database.
- Production state as verified on 8 September 2026: schema present and current, and `auth.users` holds **0 rows**. Destructive migrations remain acceptable until content is loaded.
- Note: Nixpacks does **not** prune devDependencies in this image, so `drizzle-kit` is present in production and `npm run db:migrate` works there. `db/migrate.mjs` is still the command to wire in, because it does not depend on that build-tool behaviour continuing to hold.
- [ ] Smoke-test login, database health, R2 uploads/downloads, presigned URL ownership, email flows, and the production deployment.

## Spreadsheet import and chapter editor (spec §8 step 3)

The critical-path step: until this existed there was no way to load real content, so every
later screen would have had to be built against fixtures.

- [x] `lib/import/parse.ts` — pure, database-free parsing and validation of the real
  `NTS_LMS_Content_Template.xlsx`. Built against the actual workbook rather than the spec's
  summary table, which turned up three things the spec does not mention: an `Instructions`
  tab, a `has_video` column on `Chapters` (ignored — video is out of scope per spec §9), and
  the analysis bands living in two extra columns *beside* the psychometric questions,
  interleaved with the template author's own instruction prose. Only rows whose band cell
  parses as a percentage range are treated as bands, so that prose is never imported.
- [x] Row-level error reporting with real spreadsheet row numbers, warnings separated from
  blocking errors, and one bad row never failing the whole file (spec §6).
- [x] `lib/import/commit.ts` — transactional, idempotent commit. Re-importing replaces a
  question set's questions rather than appending, and chapter rows are matched on
  (course, order) and updated in place.
- [x] Re-import deliberately preserves `notes_file_key` and `is_published`, so reloading the
  text content cannot throw away an uploaded notes PDF or silently unpublish a live chapter.
- [x] `/admin/import` — upload, preview with per-tab counts and issue list, then confirm.
  The file is re-sent and re-parsed on commit rather than cached server-side, so what is
  committed is exactly what was previewed, with no server-side session state to expire.
- [x] `/admin/course` and `/admin/course/[chapterId]` — chapter list and editor: bilingual
  titles, summary, deliverable, notes upload to R2, publish/unpublish, and a read-only view
  of the chapter's imported test questions.
- [x] Publishing is blocked until chapter notes are uploaded.
- [x] `lib/r2.ts` — S3 client, the two documented key shapes, filename sanitisation, and
  300-second presigned downloads. `npm run verify:r2` does a real round-trip (put, presign,
  fetch over plain HTTPS, delete). Run against the live bucket on 9 September 2026: all four
  steps passed, including the presigned GET fetched outside the SDK with content matching
  byte for byte.
- [x] 41 new tests (69 total, all passing), including the parser against the real customer
  template and the commit layer against the live local database.

Verified end to end over the real HTTP wire protocol, not just through unit tests: signed in
as master, uploaded a filled 10-chapter / 100-question workbook through the real server
action, previewed it, committed it (10 chapters, 110 questions, 12 question sets, 4 bands),
and re-committed the same file to confirm the database did not duplicate (0 created, 10
updated). The chapter editor's save, publish-refusal and validation paths were driven through
their no-JS server-action forms. A learner account was refused at both layers: redirected to
`/403` on the pages, and refused by the action itself when POSTed directly.

Two safeguards added that the spec does not call for:
1. `responses` cascades from `questions`, so re-importing after learners have taken tests
   would silently delete their answers. The preview counts the answers at risk, warns, and
   the commit refuses to run without explicit confirmation.
2. The template supplies a single analysis-text column, but `analysis_bands.body_hi` is NOT
   NULL. The English text currently stands in for both so a Hindi learner always sees
   something. **This needs a decision from the trainer** — see Open questions.

## Question engine and the course interface (spec §8 steps 4 and 6)

Step 4 is the piece the spec calls "the single biggest time saving in the project": one
engine serving psychometric assessments and chapter tests, differing only in how a response
is scored.

- [x] `lib/engine/index.ts` — start/resume, save, submit and read-back over the shared
  `question_sets` / `questions` / `attempts` / `responses` tables.
- [x] Resumable state: an attempt persists `current_question_index`, so a learner who closes
  the tab mid-test returns to the same question with their answers intact (spec §5).
- [x] Chapter-test scoring by `correct_option`, against the configurable pass mark.
- [x] Psychometric scoring by summing `option_scores`, measured against the best-scoring
  option per question, then matched to an analysis band and written to `analyses`.
- [x] Retake limit enforced (`retakeLimit` is retakes *after* the first attempt, so the total
  is `retakeLimit + 1`), a passed test cannot be retaken, and `progress.test_score` keeps the
  learner's *best* score so a failed retake never pulls a passing score down (spec §7).
- [x] Ownership enforced in the engine itself, not just in the pages: every read and write
  checks the attempt belongs to the calling learner.
- [x] `lib/settings.ts` — `course_settings` is created on first read, so a fresh database has
  working defaults (pass mark, retake limit, sequencing rule) with no seed step. The table
  had zero rows before this.
- [x] `lib/course.ts` — the unlock rules: chapters unlock in order, chapter N needs N-1
  complete, configurable to "open", and only published chapters are ever visible.
- [x] `/course` — the Udemy-style chapter list: cards with status, progress bar, best score,
  and a Start/Continue call to action.
- [x] `/course/[chapterId]` — notes viewer (presigned, after an access check), deliverable
  brief, attempt history and the Take/Retake test call to action.
- [x] `/course/[chapterId]/test` — the test player: one question per screen, progress bar,
  and an EN/HI toggle that switches instantly with no reload and no loss of answers, since
  both languages are already on the row and the toggle is pure client state (spec §7).
- [x] `/course/[chapterId]/test/result` — score, pass/fail and a per-question review.
- [x] Login now sends a learner to `/course`; it previously dropped them on the bare
  homepage, the same bug this plan recorded earlier for `company_admin`.

Verified end to end over the real HTTP wire protocol, not just through unit tests: a learner
signed in, saw chapter 1 available and 2-10 locked, opened chapter 1, took the test through
the real server actions and failed it (0/10, chapter marked `in_progress`), retook it and
passed (10/10, chapter `complete`, best score kept), and chapter 2 then unlocked and rendered
where it had previously redirected away. Re-taking a passed test is refused with a message,
a locked chapter redirects to `/course`, a submitted attempt refuses further answers, an
invalid option is rejected by the engine, and an anonymous request is sent to `/login`.

One bug found and fixed during that walkthrough: reading another learner's result returned
HTTP 500. Access was correctly denied — the engine throws on an ownership miss, which is the
right behaviour — but the result page now catches it and redirects instead of crashing.
Covered by a regression test.

Also changed: `vitest.config.ts` now sets `fileParallelism: false`. These are integration
suites against one shared local Postgres database, and several assert on global counts or
clean whole tables; running files in parallel let one suite's fixtures leak into another's
assertions. This surfaced as soon as a second suite touched the same tables.

The onboarding gate this section left deliberately unwired is now built -- see the next
section. Steps still outstanding: scorecards (7), `/profile`, `/admin/learners*`,
`/team/learners/[userId]`, `/admin/questions`, `/admin/analysis-bands` and `/admin/settings`.

## The onboarding funnel (spec §8 step 5)

The last thing standing between a learner and a complete journey: psychometric ->
setup questionnaire -> analysis, with the course gated until it is done.

- [x] `db/seed-content.ts` (`npm run db:seed:content`) -- **placeholder** content so the funnel
  could be built and exercised before the trainer's workbook arrives: 10 bilingual sales
  psychometric questions scored 0-3 by trait, a 6-question setup questionnaire (3 free-text),
  and 4 analysis bands with both English *and* Hindi body text. It writes to the same tables the
  spreadsheet importer writes to, so importing the real `Psychometric` and `Setup_Questionnaire`
  tabs **replaces** this rather than sitting alongside it. None of this content is meant to
  survive to launch; the trainer will replace all of it.
- [x] The seed refuses to overwrite content learners have already answered unless run with
  `--force`, the same safeguard the importer has.
- [x] `lib/onboarding.ts` -- state transitions, setup-answer persistence, analysis read-back.
  `advanceOnboardingState` only ever moves forward, so a replayed POST or a double-clicked
  button cannot undo a learner's progress.
- [x] `/onboarding/psychometric` -- runs on the shared question engine, so resume, ownership
  checks and the EN/HI toggle came for free. Re-entering after completing it redirects rather
  than starting a second attempt that would overwrite the analysis already being shown.
- [x] `/onboarding/questionnaire` -- the one part that needed its own path, because the setup
  questionnaire is unscored and may be free text, so answers go to `setup_answers` and never
  through the scored `responses` table (the amendment in spec §4). Answers are upserted, so
  returning to the page edits rather than duplicating. Deliberately one page rather than
  one-question-per-screen: spec §5 only requires that for the assessment.
- [x] `/onboarding/analysis` -- score, band label and the band's English and Hindi text, then a
  "Start the course" action that sets `onboarding_state = complete`.
- [x] The gate in `app/course/layout.tsx` is now live, and login sends an unfinished learner to
  `/onboarding` instead of a course they would only be bounced out of.
- [x] `components/assessment-player.tsx` -- the chapter-test player, extracted so the
  psychometric did not duplicate ~180 lines. The two flows differ only in wording and
  destination, so the actions are passed in as props rather than imported. The chapter test now
  renders through it and was re-verified afterwards.
- [x] 15 new tests (104 total, all passing), plus lint and a clean production build.

**The gate is conditional on content existing, by design.** With no psychometric questions
loaded -- exactly what production looks like today -- gating would redirect every learner into
a funnel they cannot finish and lock them out of the course entirely. `isOnboardingAvailable()`
makes the gate switch itself on when content lands. This was verified by deleting the
psychometric questions and confirming a `pending` learner still reaches `/course` normally.

Verified end to end over the real HTTP wire protocol, not just through unit tests: two full
runs by two learners. One scored 40.0% and one 100%, chosen to land on band boundaries. Every
out-of-order step redirects to the step the learner is actually on; `/course` was refused
before completion and served after; the questionnaire was submitted through its real no-JS
server-action form, and refused -- with the previously saved answers untouched -- for an
incomplete submission, an option key the question does not offer, and whitespace-only free
text. A master is redirected to `/admin` rather than into the funnel, and an anonymous request
goes to `/login`. Login was driven through the real form and routed by onboarding state.

Two fixes to existing code that this work forced:

1. **A latent bug in the spreadsheet importer that would have broken re-imports in production.**
   `lib/import/commit.ts` deletes every `analysis_bands` row on each import, but `analyses.band_id`
   was `NOT NULL` with no delete rule. Nothing had ever created an `analyses` row before this
   funnel existed, so it had never fired. Once a single learner completed the psychometric, the
   trainer's next import -- correcting a typo, say -- would have failed with a foreign key
   violation and rolled back entirely, with no way to fix their own content. `band_id` is now
   nullable with `ON DELETE SET NULL` (migration `0004_boring_kinsey_walden.sql`), and the
   importer inserts the new bands, re-points every existing analysis at whichever new band covers
   its score, and only then deletes the old rows. A score no new band covers loses its commentary
   rather than blocking the import -- the learner's score is their real result and is never
   discarded. Pinned by a regression test that imports, records analyses, and re-imports.
2. **Band matching was non-deterministic at a boundary.** Bands normally share edges (0-40,
   40-60), so a score of exactly 40 matched two rows and `limit 1` picked whichever Postgres
   returned first. It now orders by `min_pct` descending, resolving ties upward, in the learner's
   favour. The 40.0% walkthrough run confirmed it lands in `Emerging` rather than `Developing`.

Also changed: the engine now writes the `analyses` row even when no band covers the score,
instead of discarding it. The score is the learner's actual result; missing commentary is the
trainer's content gap, and the analysis screen already renders that case.

Note for anyone running the suite locally: `lib/onboarding.test.ts` and `lib/import/commit.test.ts`
delete all `psychometric` and `setup` question sets as fixtures, so `npm run db:seed:content`
needs re-running afterwards to get the dev content back. Several suites also assert on global
counts, so leftover course rows from manual testing will fail them -- clean up fixtures before
running the suite.

## The reporting hierarchy (spec §8 step 7)

The three-level structure the trainer asked for: the master sees every company and learner, a
company manager sees only their own people, and a learner sees only themselves.

Progress and scores were already being written correctly by the engine; nothing read them back
except the learner's own course list. This adds one read layer and surfaces it three ways, so
"how is this learner doing" has a single definition rather than three that drift apart.

- [x] `lib/reporting.ts` -- the shared read layer. Every organisation-scoped read goes through
  `organizationUserWhere`, per the critical rule in spec §2; a company manager asking for
  another organisation's id is rejected by the scope helper itself rather than by the page.
- [x] `assertCanViewLearner` -- master sees anyone, a manager only their own organisation's
  members, a learner only themselves. It lives in the read layer, not in the pages, because
  these ids arrive from URLs and are untrusted.
- [x] `/admin` -- was a bare redirect to the companies list; now the master dashboard. Platform
  totals, then every company with manager count, learner count against seat limit, onboarded
  count, average completion and average score.
- [x] `/admin/learners` and `/admin/learners/[userId]` -- individual learners (no organisation)
  and the whole-platform grid, plus any learner's full record.
- [x] `/admin/companies/[orgId]` -- gains a progress grid above the membership list. The list
  below it is now explicitly about members and roles, which is what it was always doing.
- [x] `/team` -- the manager's dashboard is now the learners x chapters grid spec §5 asked for,
  replacing a roster that showed only onboarding state. The placeholder line promising
  "chapter scores and progress will show here" is delivered and gone.
- [x] The company name moved into the `/team` banner, so a manager always sees which
  organisation they are looking at on every screen, not just the landing page.
- [x] `/scorecard` -- the learner's own record: psychometric result, per-chapter scores,
  completion and attempt history.
- [x] `components/progress-grid.tsx` and `components/learner-record.tsx` -- shared by all three
  roles, so the master, the manager and the learner read identical numbers.
- [x] `components/learner-shell.tsx` -- the header and onboarding gate extracted from the course
  layout so `/scorecard` cannot drift from `/course`.
- [x] Admin nav: Dashboard added, Learners enabled. Questions, Analysis bands and Settings
  remain marked SOON because they genuinely are not built.
- [x] 14 new tests (118 total), lint clean, production build verified.

Verified end to end over the real HTTP wire protocol against a seeded company (Acme Industries:
one manager, three learners, real imported content and real attempt data driven through the
engine). The master dashboard reported the company with 1 manager, 3 of 25 seats, 2 onboarded,
20% average completion and 4.2 average score, all of which reconcile by hand against the
underlying rows. Every boundary was probed in both directions: a manager opening another
company's learner gets `/403`, as does a manager reaching for `/admin` or `/admin/learners`; a
learner reaching for `/team`, another learner's record, or `/admin` gets `/403`; the master
opens anyone. The manager's grid contained exactly their own three learners and no one else's.

Not built, and still outstanding: `/profile` (name, password, language preference),
`/admin/questions`, `/admin/analysis-bands` and `/admin/settings`.

## Open questions and blockers

- ~~R2 credentials are not available locally.~~ Resolved 9 September 2026: the keys were
  copied from Coolify into local `.env.local` and `npm run verify:r2` passed all four steps
  against the live `nts-lms-content` bucket — upload, presign, a presigned GET fetched over
  plain HTTPS outside the SDK with matching content, and delete. So the credentials carry
  object read *and* write permission on the right bucket, and the endpoint form is correct.
  R2 is no longer an unproven subsystem. Still untested: notes upload through the chapter
  editor **in production**, which needs content imported there first.
- **Hindi analysis-band text.** The template has no Hindi column for it, so the importer puts
  the English text in both fields. This is no longer theoretical: `/onboarding/analysis` renders
  `body_hi` directly beneath `body_en`, so once the real workbook is imported a Hindi learner
  finishes their assessment and reads the same English paragraph twice. The placeholder seed has
  genuine Hindi text and shows what it should look like. Either the trainer supplies Hindi text
  or the template gains a column -- needed before content load, not after.
- ~~Brevo has still never sent a real email.~~ Resolved 9 September 2026: with both
  `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` set locally, `lib/email.ts` sent a real password-reset
  email through the Brevo SDK to a live inbox and returned without throwing — the first time the
  send branch has ever executed rather than falling back to `console.log`. Brevo accepted the send
  (HTTP 201) from `no-reply@ntswithankit.com`. Account is on the **free plan: 300 emails/day**,
  which is a real constraint for bulk learner invitations.
- **SECURITY: the Brevo API key is published in public DNS.** The `brevo-code` TXT record on
  `ntswithankit.com` was filled in with the *API key* instead of the domain-verification code, so
  `dig +short TXT ntswithankit.com` returns the live key to anyone on the internet. The key can send
  mail as this account and manage contacts and senders — i.e. send phishing from a legitimate domain.
  **Rotate the key in Brevo, update it in Coolify and `.env.local`, and replace the TXT value** with
  the real one: `brevo-code:4e37728db9dcaf69657a71d02f5888cf`.
- **The sender domain is not verified in Brevo** (`verified: false`, `authenticated: false`), because
  of the same wrong TXT record. DKIM (`brevo1._domainkey`, `brevo2._domainkey`) and DMARC are all
  correctly published and match what Brevo expects — the verification code is the only thing missing.
  Mail sends today but is far likelier to land in spam until this is fixed. There is also **no SPF
  record** on the domain, and no MX, so replies to `no-reply@` will bounce.
- ~~No account exists in production.~~ Resolved 8 September 2026: `REGISTRATION_CODE` was set in Coolify and a master account was registered at `https://sales.ntswithankit.com/register`. Production sign-in is confirmed working. Note that accounts do not sync between environments — the local and production databases hold separate users.
- ~~`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is not set in Coolify.~~ Set by the operator on
  9 September 2026 and a rebuild run, which is what makes it take effect — the key is embedded
  at build time, so a runtime-only setting would have done nothing. After the redeploy the
  admin console loads and renders master-only pages. **Still unconfirmed: a server-action
  *write*.** Everything observed so far is a read, and reads never exercise the key. Creating a
  company from `/admin/companies` is the outstanding one-click check; "Failed to find Server
  Action" after a hard refresh would mean the variable is not enabled at buildtime.

Two configuration discrepancies found and fixed while doing this work:
1. `.env.example` declared `R2_ACCOUNT_ID`, but `docs/infrastructure.md` and Coolify both use
   `R2_ENDPOINT`. Renamed to `R2_ENDPOINT`.
2. `docs/infrastructure.md` listed only `BREVO_API_KEY` as a production variable, but
   `lib/email.ts` needs `BREVO_SENDER_EMAIL` too and falls back to console-logging without
   it — so a production deploy following the doc would have quietly delivered no mail at all.
   The doc now lists both and says so.

Also raised `serverActions.bodySizeLimit` to 25 MB in `next.config.ts`: the default is 1 MB,
which chapter notes PDFs would exceed.

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
