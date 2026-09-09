import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  analyses,
  analysisBands,
  attempts,
  authMembers,
  authOrganizations,
  authUsers,
  chapters,
  progress,
  questionSets,
} from "@/db/schema";
import { organizationUserWhere, type SessionScope } from "@/lib/db/org-scope";

// The reporting layer behind all three dashboards (docs/spec.md §5). Progress and scores are
// already written correctly by the engine; this reads them back, once, for every level of the
// hierarchy:
//
//   master        -> every company, every learner
//   company_admin -> only the learners in their own organisation
//   learner       -> only themselves
//
// Every organisation-scoped read goes through `organizationUserWhere` rather than a raw
// organization_id filter, per the critical rule in docs/spec.md §2. A missing filter here
// would leak one company's scores to another, which is the highest-severity bug in this system.

export type ChapterColumn = {
  id: string;
  order: number;
  titleEn: string;
};

export type LearnerChapterCell = {
  status: "locked" | "available" | "in_progress" | "complete";
  testScore: number | null;
};

export type LearnerProgressRow = {
  id: string;
  name: string;
  email: string;
  onboardingState: string;
  organizationId: string | null;
  organizationName: string | null;
  psychometricPct: number | null;
  bandLabel: string | null;
  chapters: Record<string, LearnerChapterCell>;
  chaptersComplete: number;
  completionPct: number;
  averageScore: number | null;
};

export type CompanyOverview = {
  id: string;
  name: string;
  slug: string;
  status: string;
  seatLimit: number | null;
  learnerCount: number;
  adminCount: number;
  onboardedCount: number;
  completionPct: number;
  averageScore: number | null;
};

function assertMaster(session: SessionScope) {
  if (session.role !== "master") {
    throw new Error("Only the master role can view this");
  }
}

/** The chapters that make up the reporting grid: published only, in course order. */
export async function listChapterColumns(): Promise<ChapterColumn[]> {
  const db = getDb();
  return db
    .select({ id: chapters.id, order: chapters.order, titleEn: chapters.titleEn })
    .from(chapters)
    .where(eq(chapters.isPublished, true))
    .orderBy(asc(chapters.order));
}

/**
 * Whether this session may look at this learner's record.
 *
 * Called by every read that names a specific user. Rendering a page behind a role gate is not
 * a security boundary -- these ids arrive from URLs and Server Action payloads.
 */
export async function assertCanViewLearner(session: SessionScope, userId: string): Promise<void> {
  if (session.role === "master") return;

  if (session.userId === userId) return;

  if (session.role === "company_admin") {
    if (!session.organizationId) throw new Error("This operation requires an organization");
    const db = getDb();
    const [membership] = await db
      .select({ id: authMembers.id })
      .from(authMembers)
      .where(and(eq(authMembers.userId, userId), eq(authMembers.organizationId, session.organizationId)))
      .limit(1);
    if (membership) return;
  }

  throw new Error("You do not have access to this learner");
}

async function buildProgressRows(
  session: SessionScope,
  users: Array<{
    id: string;
    name: string;
    email: string;
    onboardingState: string;
    organizationId: string | null;
    organizationName: string | null;
  }>,
  columns: ChapterColumn[],
): Promise<LearnerProgressRow[]> {
  if (users.length === 0) return [];

  const db = getDb();
  const userIds = users.map((user) => user.id);

  const progressRows = await db
    .select({
      userId: progress.userId,
      chapterId: progress.chapterId,
      status: progress.status,
      testScore: progress.testScore,
    })
    .from(progress)
    .where(inArray(progress.userId, userIds));

  const analysisRows = await db
    .select({
      userId: analyses.userId,
      score: analyses.psychometricScore,
      label: analysisBands.label,
      generatedAt: analyses.generatedAt,
    })
    .from(analyses)
    .leftJoin(analysisBands, eq(analysisBands.id, analyses.bandId))
    .where(inArray(analyses.userId, userIds))
    .orderBy(desc(analyses.generatedAt));

  // Most recent analysis per learner; the ordering above means the first one seen wins.
  const latestAnalysis = new Map<string, { score: number; label: string | null }>();
  for (const row of analysisRows) {
    if (!latestAnalysis.has(row.userId)) {
      latestAnalysis.set(row.userId, { score: row.score, label: row.label });
    }
  }

  const byUser = new Map<string, Map<string, LearnerChapterCell>>();
  for (const row of progressRows) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, new Map());
    byUser.get(row.userId)!.set(row.chapterId, { status: row.status, testScore: row.testScore });
  }

  return users.map((user) => {
    const cells = byUser.get(user.id) ?? new Map<string, LearnerChapterCell>();
    const chapterMap: Record<string, LearnerChapterCell> = {};
    let complete = 0;
    const scores: number[] = [];

    for (const column of columns) {
      const cell = cells.get(column.id) ?? { status: "locked" as const, testScore: null };
      chapterMap[column.id] = cell;
      if (cell.status === "complete") complete += 1;
      if (cell.testScore !== null) scores.push(cell.testScore);
    }

    const analysis = latestAnalysis.get(user.id) ?? null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      onboardingState: user.onboardingState,
      organizationId: user.organizationId,
      organizationName: user.organizationName,
      psychometricPct: analysis?.score ?? null,
      bandLabel: analysis?.label ?? null,
      chapters: chapterMap,
      chaptersComplete: complete,
      completionPct: columns.length > 0 ? (complete / columns.length) * 100 : 0,
      averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    };
  });
}

/**
 * Learner progress rows for whatever the session is allowed to see.
 *
 * A master may pass an organizationId to scope to one company; a company admin is always
 * limited to their own, and passing someone else's is rejected by the scope helper itself.
 */
export async function getLearnerProgress(
  session: SessionScope,
  organizationId?: string,
): Promise<LearnerProgressRow[]> {
  const db = getDb();
  const columns = await listChapterColumns();
  const where = organizationUserWhere(session, organizationId);

  const users = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      onboardingState: authUsers.onboardingState,
      organizationId: authMembers.organizationId,
      organizationName: authOrganizations.name,
    })
    .from(authUsers)
    .leftJoin(authMembers, eq(authMembers.userId, authUsers.id))
    .leftJoin(authOrganizations, eq(authOrganizations.id, authMembers.organizationId))
    .where(where ? and(eq(authUsers.role, "learner"), where) : eq(authUsers.role, "learner"))
    .orderBy(asc(authUsers.name));

  return buildProgressRows(session, users, columns);
}

/** Individual learners: role `learner` with no membership row (docs/spec.md §2). */
export async function getIndividualLearners(session: SessionScope): Promise<LearnerProgressRow[]> {
  assertMaster(session);
  const db = getDb();
  const columns = await listChapterColumns();

  const users = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      onboardingState: authUsers.onboardingState,
      organizationId: sql<string | null>`null`,
      organizationName: sql<string | null>`null`,
    })
    .from(authUsers)
    .leftJoin(authMembers, eq(authMembers.userId, authUsers.id))
    .where(and(eq(authUsers.role, "learner"), isNull(authMembers.id)))
    .orderBy(asc(authUsers.name));

  return buildProgressRows(session, users, columns);
}

/** Every company with its headline numbers, for the master dashboard. */
export async function getCompanyOverviews(session: SessionScope): Promise<CompanyOverview[]> {
  assertMaster(session);
  const db = getDb();
  const columns = await listChapterColumns();

  const organizations = await db
    .select()
    .from(authOrganizations)
    .orderBy(desc(authOrganizations.createdAt));

  const members = await db
    .select({
      organizationId: authMembers.organizationId,
      userId: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      onboardingState: authUsers.onboardingState,
      role: authUsers.role,
    })
    .from(authMembers)
    .innerJoin(authUsers, eq(authUsers.id, authMembers.userId));

  const learnerRows = await buildProgressRows(
    session,
    members
      .filter((member) => member.role === "learner")
      .map((member) => ({
        id: member.userId,
        name: member.name,
        email: member.email,
        onboardingState: member.onboardingState,
        organizationId: member.organizationId,
        organizationName: null,
      })),
    columns,
  );
  const rowsByOrganization = new Map<string, LearnerProgressRow[]>();
  for (const row of learnerRows) {
    if (!row.organizationId) continue;
    if (!rowsByOrganization.has(row.organizationId)) rowsByOrganization.set(row.organizationId, []);
    rowsByOrganization.get(row.organizationId)!.push(row);
  }

  return organizations.map((organization) => {
    const rows = rowsByOrganization.get(organization.id) ?? [];
    const admins = members.filter(
      (member) => member.organizationId === organization.id && member.role === "company_admin",
    );
    const scored = rows.filter((row) => row.averageScore !== null);

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      seatLimit: organization.seatLimit,
      learnerCount: rows.length,
      adminCount: admins.length,
      onboardedCount: rows.filter((row) => row.onboardingState === "complete").length,
      completionPct:
        rows.length > 0 ? rows.reduce((total, row) => total + row.completionPct, 0) / rows.length : 0,
      averageScore:
        scored.length > 0
          ? scored.reduce((total, row) => total + (row.averageScore ?? 0), 0) / scored.length
          : null,
    };
  });
}

export type LearnerRecord = {
  learner: LearnerProgressRow;
  columns: ChapterColumn[];
  attempts: Array<{
    chapterId: string | null;
    chapterTitle: string | null;
    attemptNo: number;
    score: number | null;
    maxScore: number | null;
    passed: boolean | null;
    submittedAt: Date | null;
  }>;
};

/** One learner's full record, for the master, their company admin, or the learner themselves. */
export async function getLearnerRecord(
  session: SessionScope,
  userId: string,
): Promise<LearnerRecord | null> {
  await assertCanViewLearner(session, userId);

  const db = getDb();
  const columns = await listChapterColumns();

  const [user] = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      onboardingState: authUsers.onboardingState,
      organizationId: authMembers.organizationId,
      organizationName: authOrganizations.name,
    })
    .from(authUsers)
    .leftJoin(authMembers, eq(authMembers.userId, authUsers.id))
    .leftJoin(authOrganizations, eq(authOrganizations.id, authMembers.organizationId))
    .where(eq(authUsers.id, userId))
    .limit(1);

  if (!user) return null;

  const [row] = await buildProgressRows(session, [user], columns);

  const attemptRows = await db
    .select({
      chapterId: questionSets.chapterId,
      chapterTitle: chapters.titleEn,
      attemptNo: attempts.attemptNo,
      score: attempts.score,
      maxScore: attempts.maxScore,
      passed: attempts.passed,
      submittedAt: attempts.submittedAt,
      setType: questionSets.type,
    })
    .from(attempts)
    .innerJoin(questionSets, eq(questionSets.id, attempts.setId))
    .leftJoin(chapters, eq(chapters.id, questionSets.chapterId))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")))
    .orderBy(desc(attempts.submittedAt));

  return {
    learner: row,
    columns,
    attempts: attemptRows.map((attempt) => ({
      chapterId: attempt.chapterId,
      chapterTitle: attempt.setType === "psychometric" ? "Psychometric assessment" : attempt.chapterTitle,
      attemptNo: attempt.attemptNo,
      score: attempt.score,
      maxScore: attempt.maxScore,
      passed: attempt.passed,
      submittedAt: attempt.submittedAt,
    })),
  };
}

/** Platform totals for the master dashboard header. */
export async function getPlatformSummary(session: SessionScope) {
  assertMaster(session);
  const companies = await getCompanyOverviews(session);
  const individuals = await getIndividualLearners(session);

  const allLearners = companies.reduce((total, company) => total + company.learnerCount, 0) + individuals.length;
  const weighted = [
    ...companies.map((company) => ({ count: company.learnerCount, pct: company.completionPct })),
    ...individuals.map((learner) => ({ count: 1, pct: learner.completionPct })),
  ];
  const learnersWithProgress = weighted.reduce((total, entry) => total + entry.count, 0);

  return {
    companyCount: companies.length,
    learnerCount: allLearners,
    individualCount: individuals.length,
    completionPct:
      learnersWithProgress > 0
        ? weighted.reduce((total, entry) => total + entry.pct * entry.count, 0) / learnersWithProgress
        : 0,
  };
}
