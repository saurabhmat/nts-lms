import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import {
  analyses,
  analysisBands,
  attempts,
  authUsers,
  chapters,
  courses,
  courseSettings,
  progress,
  questionSets,
  questions,
} from "@/db/schema";
import { listCourseForLearner } from "@/lib/course";
import type { SessionScope } from "@/lib/db/org-scope";
import { getCourseSettings } from "@/lib/settings";

import {
  getAttemptState,
  getSubmittedResult,
  saveResponse,
  startOrResumeAttempt,
  submitAttempt,
} from "./index";

const db = getDb();
const suffix = randomUUID().slice(0, 8);
const learnerId = `engine-learner-${suffix}`;
const otherId = `engine-other-${suffix}`;
const learner: SessionScope = { userId: learnerId, role: "learner", organizationId: null };
const other: SessionScope = { userId: otherId, role: "learner", organizationId: null };

const COURSE_SLUG = `engine-course-${suffix}`;
const OPTIONS = [
  { key: "A", en: "A en", hi: "A hi" },
  { key: "B", en: "B en", hi: "B hi" },
];

const chapterIds: string[] = [];
const testSetIds: string[] = [];
let psychometricSetId: string;

async function cleanup() {
  const [course] = await db.select().from(courses).where(eq(courses.slug, COURSE_SLUG)).limit(1);
  if (course) {
    await db.delete(chapters).where(eq(chapters.courseId, course.id));
    await db.delete(courses).where(eq(courses.id, course.id));
  }
  if (psychometricSetId) await db.delete(questionSets).where(eq(questionSets.id, psychometricSetId));
  await db.delete(authUsers).where(inArray(authUsers.id, [learnerId, otherId]));
  await db.delete(analysisBands);
}

beforeAll(async () => {
  await cleanup();

  await db.insert(authUsers).values([
    { id: learnerId, name: "Engine Learner", email: `engine-learner-${suffix}@example.com` },
    { id: otherId, name: "Other Learner", email: `engine-other-${suffix}@example.com` },
  ]);

  const [course] = await db
    .insert(courses)
    .values({ title: "Engine Course", slug: COURSE_SLUG, isPublished: true })
    .returning({ id: courses.id });

  // Three published chapters, each with a two-question test.
  for (let i = 1; i <= 3; i++) {
    const [chapter] = await db
      .insert(chapters)
      .values({
        courseId: course.id,
        order: i,
        titleEn: `Chapter ${i}`,
        titleHi: `अध्याय ${i}`,
        summaryEn: `Summary ${i}`,
        deliverableEn: `Deliverable ${i}`,
        notesFileKey: `chapters/c${i}/notes/x.pdf`,
        isPublished: true,
      })
      .returning({ id: chapters.id });
    chapterIds.push(chapter.id);

    const [set] = await db
      .insert(questionSets)
      .values({ type: "chapter_test", chapterId: chapter.id, title: `Chapter ${i} test` })
      .returning({ id: questionSets.id });
    testSetIds.push(set.id);

    await db.insert(questions).values([
      { setId: set.id, order: 1, promptEn: "Q1", promptHi: "प्र1", options: OPTIONS, correctOption: "A" },
      { setId: set.id, order: 2, promptEn: "Q2", promptHi: "प्र2", options: OPTIONS, correctOption: "B" },
    ]);
  }

  const [psySet] = await db
    .insert(questionSets)
    .values({ type: "psychometric", chapterId: null, title: "Psychometric" })
    .returning({ id: questionSets.id });
  psychometricSetId = psySet.id;

  await db.insert(questions).values([
    { setId: psySet.id, order: 1, promptEn: "P1", promptHi: "प1", options: OPTIONS, optionScores: { A: 1, B: 4 } },
    { setId: psySet.id, order: 2, promptEn: "P2", promptHi: "प2", options: OPTIONS, optionScores: { A: 2, B: 3 } },
  ]);

  await db.insert(analysisBands).values([
    { minPct: 0, maxPct: 50, label: "Developing", bodyEn: "Developing.", bodyHi: "Developing." },
    { minPct: 51, maxPct: 100, label: "Strong", bodyEn: "Strong.", bodyHi: "Strong." },
  ]);

  // Deterministic settings for the assertions below.
  const settings = await getCourseSettings();
  await db
    .update(courseSettings)
    .set({ passMarkPct: 70, retakeLimit: 2, sequencingRule: "sequential" })
    .where(eq(courseSettings.id, settings.id));
});

afterAll(cleanup);

describe("attempt lifecycle", () => {
  it("starts an attempt at question 0 with no answers", async () => {
    const state = await startOrResumeAttempt(learner, testSetIds[0]);
    expect(state.attemptNo).toBe(1);
    expect(state.currentQuestionIndex).toBe(0);
    expect(state.questions).toHaveLength(2);
    expect(state.answers).toEqual({});
  });

  it("resumes the same attempt at the question the learner left", async () => {
    const first = await startOrResumeAttempt(learner, testSetIds[0]);
    await saveResponse(learner, first.attemptId, first.questions[0].id, "A", 1);

    const resumed = await startOrResumeAttempt(learner, testSetIds[0]);
    expect(resumed.attemptId).toBe(first.attemptId);
    expect(resumed.currentQuestionIndex).toBe(1);
    expect(resumed.answers[first.questions[0].id]).toBe("A");
  });

  it("lets a learner change an answer without creating a duplicate response", async () => {
    const state = await startOrResumeAttempt(learner, testSetIds[0]);
    await saveResponse(learner, state.attemptId, state.questions[0].id, "B", 1);

    const again = await getAttemptState(learner, state.attemptId);
    expect(again?.answers[state.questions[0].id]).toBe("B");
    await saveResponse(learner, state.attemptId, state.questions[0].id, "A", 1);
    const back = await getAttemptState(learner, state.attemptId);
    expect(back?.answers[state.questions[0].id]).toBe("A");
  });

  it("refuses an option that is not on the question", async () => {
    const state = await startOrResumeAttempt(learner, testSetIds[0]);
    await expect(saveResponse(learner, state.attemptId, state.questions[0].id, "Z", 1)).rejects.toThrow(
      /not one of the options/,
    );
  });

  it("refuses to read or write another learner's attempt", async () => {
    const state = await startOrResumeAttempt(learner, testSetIds[0]);
    await expect(getAttemptState(other, state.attemptId)).rejects.toThrow(/another learner/);
    await expect(saveResponse(other, state.attemptId, state.questions[0].id, "A", 1)).rejects.toThrow(
      /another learner/,
    );
    await expect(submitAttempt(other, state.attemptId)).rejects.toThrow(/another learner/);
  });
});

describe("chapter test scoring", () => {
  it("scores a full-marks attempt and marks the chapter complete", async () => {
    const state = await startOrResumeAttempt(learner, testSetIds[0]);
    await saveResponse(learner, state.attemptId, state.questions[0].id, "A", 1);
    await saveResponse(learner, state.attemptId, state.questions[1].id, "B", 2);

    const result = await submitAttempt(learner, state.attemptId);
    expect(result.score).toBe(2);
    expect(result.maxScore).toBe(2);
    expect(result.percentage).toBe(100);
    expect(result.passed).toBe(true);

    const [row] = await db
      .select()
      .from(progress)
      .where(eq(progress.chapterId, chapterIds[0]));
    expect(row.status).toBe("complete");
    expect(row.testScore).toBe(2);
    expect(row.completedAt).toBeInstanceOf(Date);
  });

  it("returns a per-question review", async () => {
    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.userId, learnerId))
      .orderBy(attempts.startedAt);
    const result = await submitAttempt(learner, attempt.id);
    expect(result.review).toHaveLength(2);
    expect(result.review[0]).toMatchObject({ selectedOption: "A", correctOption: "A", isCorrect: true });
  });

  it("refuses a new attempt once the test is passed", async () => {
    await expect(startOrResumeAttempt(learner, testSetIds[0])).rejects.toThrow(/already passed/);
  });

  it("marks a failed attempt in_progress, not complete", async () => {
    const state = await startOrResumeAttempt(learner, testSetIds[1]);
    await saveResponse(learner, state.attemptId, state.questions[0].id, "B", 1);
    await saveResponse(learner, state.attemptId, state.questions[1].id, "A", 2);

    const result = await submitAttempt(learner, state.attemptId);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);

    const [row] = await db.select().from(progress).where(eq(progress.chapterId, chapterIds[1]));
    expect(row.status).toBe("in_progress");
    expect(row.completedAt).toBeNull();
  });

  it("keeps the best score across retakes", async () => {
    const second = await startOrResumeAttempt(learner, testSetIds[1]);
    expect(second.attemptNo).toBe(2);
    await saveResponse(learner, second.attemptId, second.questions[0].id, "A", 1);
    await saveResponse(learner, second.attemptId, second.questions[1].id, "A", 2);
    await submitAttempt(learner, second.attemptId);

    const [row] = await db.select().from(progress).where(eq(progress.chapterId, chapterIds[1]));
    expect(row.testScore).toBe(1); // 1 of 2, better than the previous 0
    expect(row.status).toBe("in_progress");
  });

  it("enforces the retake limit", async () => {
    const third = await startOrResumeAttempt(learner, testSetIds[1]);
    expect(third.attemptNo).toBe(3);
    await saveResponse(learner, third.attemptId, third.questions[0].id, "B", 1);
    await submitAttempt(learner, third.attemptId);

    // retakeLimit 2 means three attempts in total; the fourth is refused.
    await expect(startOrResumeAttempt(learner, testSetIds[1])).rejects.toThrow(/all 3 attempts/);
  });

  it("does not double-count a re-submitted attempt", async () => {
    const state = await startOrResumeAttempt(other, testSetIds[0]);
    await saveResponse(other, state.attemptId, state.questions[0].id, "A", 1);
    await saveResponse(other, state.attemptId, state.questions[1].id, "B", 2);

    const first = await submitAttempt(other, state.attemptId);
    const again = await submitAttempt(other, state.attemptId);
    expect(again.score).toBe(first.score);

    const rows = await db.select().from(attempts).where(eq(attempts.id, state.attemptId));
    expect(rows[0].status).toBe("submitted");
  });
});

describe("reading a finished attempt", () => {
  it("returns a submitted attempt to its owner without mutating it", async () => {
    const [submitted] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.userId, otherId))
      .limit(1);

    const result = await getSubmittedResult(other, submitted.id);
    expect(result?.score).toBe(submitted.score);
    expect(result?.review).toHaveLength(2);

    const [after] = await db.select().from(attempts).where(eq(attempts.id, submitted.id));
    expect(after.submittedAt).toEqual(submitted.submittedAt);
  });

  it("refuses to return another learner's attempt", async () => {
    const [submitted] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.userId, otherId))
      .limit(1);

    await expect(getSubmittedResult(learner, submitted.id)).rejects.toThrow(/another learner/);
  });

  it("returns null for an attempt that is still in progress", async () => {
    const state = await startOrResumeAttempt(other, testSetIds[1]);
    expect(await getSubmittedResult(other, state.attemptId)).toBeNull();
  });
});

describe("psychometric scoring", () => {
  it("sums option scores against the best possible total and records a band", async () => {
    const state = await startOrResumeAttempt(learner, psychometricSetId);
    await saveResponse(learner, state.attemptId, state.questions[0].id, "B", 1); // 4 of 4
    await saveResponse(learner, state.attemptId, state.questions[1].id, "A", 2); // 2 of 3

    const result = await submitAttempt(learner, state.attemptId);
    expect(result.score).toBe(6);
    expect(result.maxScore).toBe(7);
    expect(result.passed).toBeNull(); // there is no pass/fail on a psychometric

    const [analysis] = await db.select().from(analyses).where(eq(analyses.userId, learnerId));
    expect(analysis).toBeDefined();
    expect(analysis.bandId).not.toBeNull();
    const [band] = await db.select().from(analysisBands).where(eq(analysisBands.id, analysis.bandId!));
    expect(band.label).toBe("Strong");
  });
});

describe("chapter unlock rules", () => {
  it("locks chapter 3 until chapter 2 is complete, and never locks chapter 1", async () => {
    const course = await listCourseForLearner(learner);
    expect(course).toHaveLength(3);
    expect(course[0].status).toBe("complete"); // passed earlier
    expect(course[1].status).toBe("in_progress"); // attempted, not passed
    expect(course[2].status).toBe("locked");
  });

  it("shows an untouched course with only the first chapter available", async () => {
    const fresh = await listCourseForLearner(other);
    expect(fresh[0].status).toBe("complete"); // `other` passed chapter 1 above
    expect(fresh[1].status).toBe("available");
    expect(fresh[2].status).toBe("locked");
  });

  it("opens every chapter when the sequencing rule is open", async () => {
    const settings = await getCourseSettings();
    await db.update(courseSettings).set({ sequencingRule: "open" }).where(eq(courseSettings.id, settings.id));

    const course = await listCourseForLearner(learner);
    expect(course.map((chapter) => chapter.status)).not.toContain("locked");

    await db.update(courseSettings).set({ sequencingRule: "sequential" }).where(eq(courseSettings.id, settings.id));
  });

  it("hides unpublished chapters from learners", async () => {
    await db.update(chapters).set({ isPublished: false }).where(eq(chapters.id, chapterIds[2]));
    const course = await listCourseForLearner(learner);
    expect(course).toHaveLength(2);
    await db.update(chapters).set({ isPublished: true }).where(eq(chapters.id, chapterIds[2]));
  });
});
