# NTS Sales Training Platform — Technical Spec

Source of truth for the build. Read fully before writing code.

---

## 1. What This Is

A multi-tenant training platform. A trainer (master admin) onboards companies and individual learners, uploads a 10-chapter course, and every learner goes through a psychometric assessment before the course unlocks. Chapter tests are bilingual (Hindi/English) and auto-scored. Everyone's progress rolls up to company admins and the trainer.

**No payments. No video at launch. No deliverable grading.**

---

## 2. Roles

| Role | Scope |
|---|---|
| `master` | Everything, across all organisations |
| `company_admin` | Read-only over learners in their own organisation |
| `learner` | Own progress only |

**Critical design rule:** enrollment attaches to the **user**, never to the organisation. An individual learner is simply a user with `organization_id = null`. There must be exactly one code path for company learners and individuals — never two.

**Second critical rule:** every organisation-scoped query goes through one Drizzle helper that applies the `organization_id` filter from the session. Never write a raw org-scoped query outside it. A missing filter leaks one company's scores to another — the highest-severity bug possible here. Write a test for it.

---

## 3. Stack

- Next.js (App Router) + TypeScript, strict
- Tailwind + shadcn/ui, lucide-react, recharts
- Postgres + Drizzle ORM
- Better Auth with the organization plugin
- Cloudflare R2 for chapter notes (S3 SDK, signed URLs, server-side generated after an ownership check)
- Brevo for transactional email
- Deployed via Coolify

Server Components by default. `"use client"` only where interaction requires it.

---

## 4. Schema

```
organizations     id, name, slug, logo_url, brand_color, seat_limit, status, created_at
users             id, email, name, role, organization_id (nullable),
                  onboarding_state (pending | psychometric_done | questionnaire_done | complete),
                  preferred_language (en | hi), created_at
invitations       id, organization_id (nullable), email, role, token, expires_at, accepted_at

courses           id, title, slug, is_published
chapters          id, course_id, order, title_en, title_hi, summary_en,
                  notes_file_key, deliverable_en, is_published, published_at

question_sets     id, type (psychometric | setup | chapter_test), chapter_id (nullable), title
questions         id, set_id, order, prompt_en, prompt_hi, options (jsonb),
                  correct_option (nullable), trait (nullable), option_scores (jsonb, nullable)

attempts          id, user_id, set_id, started_at, submitted_at, score, max_score,
                  passed, attempt_no
responses         id, attempt_id, question_id, selected_option, is_correct

analysis_bands    id, min_pct, max_pct, label, body_en, body_hi
analyses          id, user_id, psychometric_score, band_id, generated_at

progress          user_id, chapter_id, status (locked|available|in_progress|complete),
                  test_score, completed_at
```

**`options` jsonb shape:**
```json
[{"key":"A","en":"Ask about budget","hi":"बजट के बारे में पूछें"},
 {"key":"B","en":"Understand their problem","hi":"उनकी समस्या को समझें"}]
```

**Bilingual belongs on the row, not in an i18n file.** Question and option content is bilingual; UI chrome stays English. Do not set up next-intl or any i18n framework.

**One question engine, three uses.** Psychometric, setup questionnaire and chapter tests share `question_sets` / `questions` / `attempts` / `responses`, differing only by `type`. Psychometric questions have `option_scores` and no `correct_option`; chapter tests have `correct_option` and no `option_scores`. Build the engine once — this is the single biggest time saving in the project.

Amendments: the setup questionnaire is unscored and may include free-text answers, so its answers are stored in `setup_answers` rather than forced through scored `responses`. `course_settings` stores the configurable sequencing rule, pass mark, and retake limit required by section 7. Assessment attempts persist `current_question_index` so interrupted assessments resume at the same question.

Identity authority: Better Auth's `auth.users`, `auth.organizations`, and `auth.invitations` are the only identity, company, and invitation sources of truth. There are no duplicate public identity tables. `auth.members` is the sole source of user-to-organization membership; `auth.users` does not duplicate that relationship. LMS records reference `auth.users.id` for learner ownership. The 14 conceptual LMS tables therefore occupy 11 public tables plus 3 Better Auth-owned identity tables; the database has 18 physical tables including all 7 Better Auth tables.

When the trainer creates a company, Better Auth creates one row in `auth.organizations`. When the trainer invites a learner, Better Auth creates one row in `auth.invitations` linked by `organization_id` to `auth.organizations` and by `inviter_id` to `auth.users`; accepting the invitation creates or updates the learner in `auth.users` and creates the membership row in `auth.members`. The LMS reads those same rows.

Role resolution: the application role (`master`, `company_admin`, or `learner`) lives on `auth.users.role`. A `master` has no membership row and can operate across organizations. A company learner or company admin has exactly one `auth.members` row; its Better Auth membership role is the organization-level projection of the application role. An individual learner has `auth.users.role = 'learner'` and no membership row. The scope helper reads `auth.members` for organization access and `auth.users.id` for an individual learner's own records.

---

## 5. Routes

### Auth
`/login` · `/forgot-password` · `/reset-password/[token]` · `/invite/[token]`

### Onboarding — `/onboarding/*`
Gated: a learner with `onboarding_state != complete` is redirected here from anywhere.

| Route | Screen |
|---|---|
| `/onboarding/psychometric` | Assessment, one question per screen, progress bar |
| `/onboarding/questionnaire` | Current sales setup questions |
| `/onboarding/analysis` | Score + band analysis text, "Start the course" CTA |

State persists — a learner who drops out mid-assessment resumes at the same question.

### Learner — `/course/*`

| Route | Screen |
|---|---|
| `/course` | Chapter list, Udemy-style cards, status per chapter |
| `/course/[chapterId]` | Notes viewer, deliverable brief, "Take test" CTA |
| `/course/[chapterId]/test` | Test player, EN/HI toggle in header, one question per screen |
| `/course/[chapterId]/test/result` | Score, pass/fail, per-question review |
| `/scorecard` | Psychometric result, chapter scores, completion |
| `/profile` | Name, password, language preference |

### Company Admin — `/team/*`

| Route | Screen |
|---|---|
| `/team` | Learners × 10 chapters grid — scores and progress |
| `/team/learners/[userId]` | One learner's full record |

### Master — `/admin/*`

| Route | Screen |
|---|---|
| `/admin` | All organisations, learner counts, completion rates |
| `/admin/companies` | List, create |
| `/admin/companies/[orgId]` | Detail, learner roster, bulk-add learners by pasting emails |
| `/admin/learners` | Individual learners (no organisation) |
| `/admin/learners/[userId]` | Full record for any learner |
| `/admin/course` | Chapter list |
| `/admin/course/[chapterId]` | Chapter editor — titles, notes upload to R2, deliverable, publish |
| `/admin/questions` | Question sets, per-set question list |
| `/admin/import` | **Spreadsheet import** — see §6 |
| `/admin/analysis-bands` | Score bands and their analysis text |
| `/admin/settings` | Email templates, sequencing rule, pass mark, retake limit |

---

## 6. Spreadsheet Import

Build this early — it is on the critical path, not a nice-to-have. Content arrives as one workbook with these tabs, matching `NTS_LMS_Content_Template.xlsx`:

| Tab | Target |
|---|---|
| `Chapters` | `chapters` |
| `Chapter_Tests` | `question_sets` (type `chapter_test`) + `questions` |
| `Psychometric` | `question_sets` (type `psychometric`) + `questions` + `analysis_bands` |
| `Setup_Questionnaire` | `question_sets` (type `setup`) + `questions` |

Requirements:
- Parse `.xlsx` server-side with SheetJS
- **Preview before commit** — show parsed rows and validation errors, then confirm
- Validate: every question has both `_en` and `_hi`; `correct_option` matches an existing option key; chapter numbers 1–10 present
- Idempotent — re-importing replaces a chapter's questions rather than duplicating them
- Report row-level errors with row numbers, don't fail the whole file on one bad row

---

## 7. Business Rules

- **Sequencing:** chapters unlock in order by default; chapter N requires chapter N−1 complete. Configurable in settings.
- **Onboarding gate:** no chapter is accessible until `onboarding_state = complete`.
- **Test scoring:** `correct_option` match, `score` = correct count, pass mark from settings.
- **Psychometric scoring:** sum `option_scores` for chosen options; percentage of max determines the band.
- **Retakes:** limit from settings; `attempt_no` increments; the scorecard shows the best attempt.
- **Language toggle:** switches question and option text instantly, no reload, no loss of answers already given.

---

## 8. Build Order

1. Scaffold, schema, Better Auth, seed script
2. Admin: companies, learners, invitations
3. **Spreadsheet import + chapter editor** ← unblocks real content
4. Question engine (shared) + test player with language toggle
5. Onboarding funnel: psychometric → questionnaire → analysis
6. Course interface: chapter list, notes viewer
7. Scorecards: learner, company admin, master
8. Emails, monitoring, backups, deploy

Steps 1–3 first, in that order. Once step 3 works, real content loads while the rest is built — every later screen is developed against real data instead of fixtures.

---

## 9. Not In Scope

Payments · video hosting · deliverable upload and grading · execution trackers · practice notes · rubric reports · certificates · company admins managing their own seats · UI internationalisation · native mobile apps.

Do not build, stub or scaffold any of these.
