import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { attempts, chapters, courses, progress, questionSets, questions } from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";
import { presignedDownloadUrl } from "@/lib/r2";
import { getCourseSettings } from "@/lib/settings";

export type ChapterStatus = "locked" | "available" | "in_progress" | "complete";

export type CourseChapter = {
  id: string;
  order: number;
  titleEn: string;
  titleHi: string;
  summaryEn: string;
  status: ChapterStatus;
  testScore: number | null;
  questionCount: number;
  hasNotes: boolean;
};

/**
 * The learner's chapter list, with the unlock rules from docs/spec.md §7 applied.
 *
 * Chapters unlock in order by default: chapter N needs chapter N-1 complete. The rule is
 * configurable, so "open" makes every published chapter available at once. Only published
 * chapters are ever visible to a learner.
 */
export async function listCourseForLearner(session: SessionScope): Promise<CourseChapter[]> {
  const db = getDb();
  const settings = await getCourseSettings();

  const rows = await db
    .select({
      id: chapters.id,
      order: chapters.order,
      titleEn: chapters.titleEn,
      titleHi: chapters.titleHi,
      summaryEn: chapters.summaryEn,
      notesFileKey: chapters.notesFileKey,
      status: progress.status,
      testScore: progress.testScore,
    })
    .from(chapters)
    .innerJoin(courses, eq(courses.id, chapters.courseId))
    .leftJoin(progress, and(eq(progress.chapterId, chapters.id), eq(progress.userId, session.userId)))
    .where(eq(chapters.isPublished, true))
    .orderBy(asc(chapters.order));

  const counts = await db
    .select({ chapterId: questionSets.chapterId, questionId: questions.id })
    .from(questionSets)
    .innerJoin(questions, eq(questions.setId, questionSets.id))
    .where(eq(questionSets.type, "chapter_test"));

  const questionCountByChapter = new Map<string, number>();
  for (const row of counts) {
    if (!row.chapterId) continue;
    questionCountByChapter.set(row.chapterId, (questionCountByChapter.get(row.chapterId) ?? 0) + 1);
  }

  const open = settings.sequencingRule === "open";
  let previousComplete = true; // the first chapter is always reachable

  return rows.map((row) => {
    const recorded = row.status ?? null;
    let status: ChapterStatus;

    if (recorded === "complete") {
      status = "complete";
    } else if (open || previousComplete) {
      status = recorded === "in_progress" ? "in_progress" : "available";
    } else {
      status = "locked";
    }

    previousComplete = status === "complete";

    return {
      id: row.id,
      order: row.order,
      titleEn: row.titleEn,
      titleHi: row.titleHi,
      summaryEn: row.summaryEn,
      status,
      testScore: row.testScore,
      questionCount: questionCountByChapter.get(row.id) ?? 0,
      hasNotes: Boolean(row.notesFileKey),
    };
  });
}

export async function getChapterForLearner(session: SessionScope, chapterId: string) {
  const course = await listCourseForLearner(session);
  const chapter = course.find((entry) => entry.id === chapterId);
  if (!chapter) return null;

  const db = getDb();
  const [row] = await db
    .select({ deliverableEn: chapters.deliverableEn, notesFileKey: chapters.notesFileKey })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  const [set] = await db
    .select({ id: questionSets.id })
    .from(questionSets)
    .where(and(eq(questionSets.chapterId, chapterId), eq(questionSets.type, "chapter_test")))
    .limit(1);

  const attemptRows = set
    ? await db
        .select({
          id: attempts.id,
          attemptNo: attempts.attemptNo,
          score: attempts.score,
          maxScore: attempts.maxScore,
          passed: attempts.passed,
          status: attempts.status,
        })
        .from(attempts)
        .where(and(eq(attempts.userId, session.userId), eq(attempts.setId, set.id)))
        .orderBy(asc(attempts.attemptNo))
    : [];

  const settings = await getCourseSettings();

  return {
    chapter,
    deliverableEn: row?.deliverableEn ?? "",
    setId: set?.id ?? null,
    attempts: attemptRows,
    attemptsRemaining: Math.max(settings.retakeLimit + 1 - attemptRows.length, 0),
    passMarkPct: settings.passMarkPct,
    notesFileKey: row?.notesFileKey ?? null,
  };
}

/**
 * A short-lived download URL for a chapter's notes, issued only after checking that this
 * learner may actually open this chapter (docs/spec.md §3: the ownership check happens
 * server-side and the bucket key never reaches the client).
 */
export async function getLearnerNotesUrl(session: SessionScope, chapterId: string): Promise<string | null> {
  const detail = await getChapterForLearner(session, chapterId);
  if (!detail) return null;
  if (detail.chapter.status === "locked") {
    throw new Error("This chapter is locked");
  }
  if (!detail.notesFileKey) return null;

  return presignedDownloadUrl(detail.notesFileKey);
}

export async function assertChapterAccessible(session: SessionScope, chapterId: string) {
  const detail = await getChapterForLearner(session, chapterId);
  if (!detail) throw new Error("Chapter not found");
  if (detail.chapter.status === "locked") throw new Error("This chapter is locked");
  return detail;
}
