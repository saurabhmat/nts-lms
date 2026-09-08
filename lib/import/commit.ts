import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  analysisBands as analysisBandsTable,
  attempts,
  chapters as chaptersTable,
  courses,
  questionSets,
  questions as questionsTable,
  responses,
} from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

import { hasBlockingErrors, type ParsedQuestion, type ParsedWorkbook } from "./parse";

const COURSE_SLUG = "nts-sales-mastery";
const COURSE_TITLE = "NTS Sales Mastery";

export type CommitSummary = {
  chaptersCreated: number;
  chaptersUpdated: number;
  chapterTestQuestions: number;
  psychometricQuestions: number;
  setupQuestions: number;
  analysisBands: number;
  deletedResponses: number;
};

function assertMaster(session: SessionScope) {
  if (session.role !== "master") {
    throw new Error("Only the master role can import course content");
  }
}

function questionValues(setId: string, question: ParsedQuestion) {
  return {
    setId,
    order: question.questionNumber,
    promptEn: question.promptEn,
    promptHi: question.promptHi,
    options: question.options,
    correctOption: question.correctOption,
    trait: question.trait,
    optionScores: question.optionScores,
  };
}

/**
 * Counts learner answers that a re-import would destroy.
 *
 * Re-importing replaces a question set's questions (docs/spec.md §6), and `responses`
 * cascades from `questions`. Once learners have taken a test, that cascade silently
 * erases their answers, so the import flow surfaces this count in the preview and
 * refuses to commit unless the caller explicitly confirms.
 */
export async function countResponsesAtRisk(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(responses)
    .innerJoin(questionsTable, eq(questionsTable.id, responses.questionId));
  return row?.count ?? 0;
}

export async function commitWorkbook(
  session: SessionScope,
  parsed: ParsedWorkbook,
  options: { confirmDestructive?: boolean } = {},
): Promise<CommitSummary> {
  assertMaster(session);

  if (hasBlockingErrors(parsed.issues)) {
    throw new Error("This workbook still has errors. Fix them and upload it again.");
  }

  const responsesAtRisk = await countResponsesAtRisk();
  if (responsesAtRisk > 0 && !options.confirmDestructive) {
    throw new Error(
      `This import would delete ${responsesAtRisk} learner answer${responsesAtRisk === 1 ? "" : "s"} already recorded against the current questions. Confirm explicitly to proceed.`,
    );
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    const summary: CommitSummary = {
      chaptersCreated: 0,
      chaptersUpdated: 0,
      chapterTestQuestions: 0,
      psychometricQuestions: 0,
      setupQuestions: 0,
      analysisBands: 0,
      deletedResponses: responsesAtRisk,
    };

    const [course] = await tx
      .insert(courses)
      .values({ title: COURSE_TITLE, slug: COURSE_SLUG, isPublished: false })
      .onConflictDoUpdate({ target: courses.slug, set: { title: COURSE_TITLE } })
      .returning();

    // Chapter rows are matched on (course, order). notes_file_key and is_published are
    // deliberately NOT touched: a re-import of the text content must not throw away an
    // already-uploaded notes PDF or silently unpublish a live chapter.
    const chapterIdByNumber = new Map<number, string>();
    for (const chapter of parsed.chapters) {
      const [existing] = await tx
        .select({ id: chaptersTable.id })
        .from(chaptersTable)
        .where(and(eq(chaptersTable.courseId, course.id), eq(chaptersTable.order, chapter.chapterNumber)))
        .limit(1);

      if (existing) {
        await tx
          .update(chaptersTable)
          .set({
            titleEn: chapter.titleEn,
            titleHi: chapter.titleHi,
            summaryEn: chapter.summaryEn,
            deliverableEn: chapter.deliverableEn,
          })
          .where(eq(chaptersTable.id, existing.id));
        chapterIdByNumber.set(chapter.chapterNumber, existing.id);
        summary.chaptersUpdated++;
      } else {
        const [created] = await tx
          .insert(chaptersTable)
          .values({
            courseId: course.id,
            order: chapter.chapterNumber,
            titleEn: chapter.titleEn,
            titleHi: chapter.titleHi,
            summaryEn: chapter.summaryEn,
            deliverableEn: chapter.deliverableEn,
          })
          .returning({ id: chaptersTable.id });
        chapterIdByNumber.set(chapter.chapterNumber, created.id);
        summary.chaptersCreated++;
      }
    }

    // Replaces the set's questions rather than appending, so re-importing the same
    // workbook is idempotent instead of duplicating every question.
    async function replaceQuestions(setId: string, incoming: ParsedQuestion[]) {
      const existingQuestions = await tx
        .select({ id: questionsTable.id })
        .from(questionsTable)
        .where(eq(questionsTable.setId, setId));
      if (existingQuestions.length > 0) {
        await tx.delete(questionsTable).where(
          inArray(questionsTable.id, existingQuestions.map((question) => question.id)),
        );
      }
      if (incoming.length > 0) {
        await tx.insert(questionsTable).values(incoming.map((question) => questionValues(setId, question)));
      }
    }

    async function findOrCreateSet(
      type: "chapter_test" | "psychometric" | "setup",
      chapterId: string | null,
      title: string,
    ): Promise<string> {
      const [existing] = await tx
        .select({ id: questionSets.id })
        .from(questionSets)
        .where(
          and(
            eq(questionSets.type, type),
            chapterId === null ? isNull(questionSets.chapterId) : eq(questionSets.chapterId, chapterId),
          ),
        )
        .limit(1);
      if (existing) {
        await tx.update(questionSets).set({ title }).where(eq(questionSets.id, existing.id));
        return existing.id;
      }
      const [created] = await tx
        .insert(questionSets)
        .values({ type, chapterId, title })
        .returning({ id: questionSets.id });
      return created.id;
    }

    for (const [chapterNumber, chapterId] of chapterIdByNumber) {
      const forChapter = parsed.chapterTests.filter((question) => question.chapterNumber === chapterNumber);
      const setId = await findOrCreateSet("chapter_test", chapterId, `Chapter ${chapterNumber} test`);
      await replaceQuestions(setId, forChapter);
      summary.chapterTestQuestions += forChapter.length;
    }

    if (parsed.psychometric.length > 0) {
      const setId = await findOrCreateSet("psychometric", null, "Psychometric assessment");
      await replaceQuestions(setId, parsed.psychometric);
      summary.psychometricQuestions = parsed.psychometric.length;
    }

    if (parsed.setup.length > 0) {
      const setId = await findOrCreateSet("setup", null, "Sales setup questionnaire");
      await replaceQuestions(setId, parsed.setup);
      summary.setupQuestions = parsed.setup.length;
    }

    if (parsed.analysisBands.length > 0) {
      await tx.delete(analysisBandsTable);
      await tx.insert(analysisBandsTable).values(
        parsed.analysisBands.map((band) => ({
          minPct: band.minPct,
          maxPct: band.maxPct,
          label: band.label,
          // The template supplies a single analysis column. Until the trainer provides
          // Hindi band text, the English text stands in for both -- body_hi is NOT NULL
          // and a Hindi learner must still see something after the assessment.
          bodyEn: band.body,
          bodyHi: band.body,
        })),
      );
      summary.analysisBands = parsed.analysisBands.length;
    }

    return summary;
  });
}

export async function getImportedContentSummary() {
  const db = getDb();
  const [course] = await db.select().from(courses).where(eq(courses.slug, COURSE_SLUG)).limit(1);
  if (!course) return null;

  const chapterRows = await db
    .select({ id: chaptersTable.id, order: chaptersTable.order, titleEn: chaptersTable.titleEn })
    .from(chaptersTable)
    .where(eq(chaptersTable.courseId, course.id))
    .orderBy(chaptersTable.order);

  const [questionCount] = await db.select({ count: sql<number>`count(*)::int` }).from(questionsTable);
  const [bandCount] = await db.select({ count: sql<number>`count(*)::int` }).from(analysisBandsTable);
  const [attemptCount] = await db.select({ count: sql<number>`count(*)::int` }).from(attempts);

  return {
    course,
    chapters: chapterRows,
    questionCount: questionCount?.count ?? 0,
    bandCount: bandCount?.count ?? 0,
    attemptCount: attemptCount?.count ?? 0,
  };
}
