import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  analyses,
  analysisBands,
  attempts,
  progress,
  questionSets,
  questions,
  responses,
} from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";
import { getCourseSettings } from "@/lib/settings";

// The one question engine described in docs/spec.md §4: psychometric assessments and
// chapter tests are the same flow over the same tables, differing only in how a response
// is scored. Psychometric questions carry option_scores and no correct answer; chapter
// tests carry a correct answer and no scores.

export type EngineQuestion = {
  id: string;
  order: number;
  promptEn: string;
  promptHi: string;
  options: Array<{ key: string; en: string; hi: string }>;
};

export type AttemptState = {
  attemptId: string;
  setId: string;
  setType: "psychometric" | "setup" | "chapter_test";
  chapterId: string | null;
  attemptNo: number;
  currentQuestionIndex: number;
  questions: EngineQuestion[];
  answers: Record<string, string>;
};

export type AttemptResult = {
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean | null;
  review: Array<{
    question: EngineQuestion;
    selectedOption: string | null;
    correctOption: string | null;
    isCorrect: boolean | null;
  }>;
};

function assertOwner(session: SessionScope, ownerId: string) {
  if (session.userId !== ownerId) {
    throw new Error("This attempt belongs to another learner");
  }
}

export async function getQuestionSetForChapter(chapterId: string) {
  const db = getDb();
  const [set] = await db
    .select()
    .from(questionSets)
    .where(and(eq(questionSets.chapterId, chapterId), eq(questionSets.type, "chapter_test")))
    .limit(1);
  return set ?? null;
}

async function loadQuestions(setId: string): Promise<EngineQuestion[]> {
  const db = getDb();
  return db
    .select({
      id: questions.id,
      order: questions.order,
      promptEn: questions.promptEn,
      promptHi: questions.promptHi,
      options: questions.options,
    })
    .from(questions)
    .where(eq(questions.setId, setId))
    .orderBy(asc(questions.order));
}

/**
 * Resumes the learner's in-progress attempt at the same question, or starts a new one.
 *
 * Resuming is the default: docs/spec.md §5 requires a learner who drops out mid-assessment
 * to come back to the question they left, which is what `current_question_index` is for.
 */
export async function startOrResumeAttempt(session: SessionScope, setId: string): Promise<AttemptState> {
  const db = getDb();

  const [set] = await db.select().from(questionSets).where(eq(questionSets.id, setId)).limit(1);
  if (!set) throw new Error("Question set not found");

  const setQuestions = await loadQuestions(setId);
  if (setQuestions.length === 0) throw new Error("This assessment has no questions yet");

  const [open] = await db
    .select()
    .from(attempts)
    .where(
      and(eq(attempts.userId, session.userId), eq(attempts.setId, setId), eq(attempts.status, "in_progress")),
    )
    .orderBy(desc(attempts.startedAt))
    .limit(1);

  if (open) {
    return buildState(open.id, set, setQuestions, open.attemptNo, open.currentQuestionIndex);
  }

  const previous = await db
    .select({ attemptNo: attempts.attemptNo, passed: attempts.passed })
    .from(attempts)
    .where(and(eq(attempts.userId, session.userId), eq(attempts.setId, setId)))
    .orderBy(desc(attempts.attemptNo));

  if (previous.some((attempt) => attempt.passed)) {
    throw new Error("You have already passed this test");
  }

  // retakeLimit is the number of retakes allowed *after* the first attempt, so the total
  // number of attempts a learner gets is retakeLimit + 1.
  if (set.type === "chapter_test") {
    const { retakeLimit } = await getCourseSettings();
    if (previous.length > retakeLimit) {
      throw new Error(`You have used all ${retakeLimit + 1} attempts for this test`);
    }
  }

  const attemptNo = (previous[0]?.attemptNo ?? 0) + 1;
  const [created] = await db
    .insert(attempts)
    .values({ userId: session.userId, setId, attemptNo, currentQuestionIndex: 0, status: "in_progress" })
    .returning();

  return buildState(created.id, set, setQuestions, created.attemptNo, 0);
}

async function buildState(
  attemptId: string,
  set: typeof questionSets.$inferSelect,
  setQuestions: EngineQuestion[],
  attemptNo: number,
  currentQuestionIndex: number,
): Promise<AttemptState> {
  const db = getDb();
  const saved = await db
    .select({ questionId: responses.questionId, selectedOption: responses.selectedOption })
    .from(responses)
    .where(eq(responses.attemptId, attemptId));

  return {
    attemptId,
    setId: set.id,
    setType: set.type,
    chapterId: set.chapterId,
    attemptNo,
    currentQuestionIndex,
    questions: setQuestions,
    answers: Object.fromEntries(saved.map((row) => [row.questionId, row.selectedOption])),
  };
}

export async function getAttemptState(session: SessionScope, attemptId: string): Promise<AttemptState | null> {
  const db = getDb();
  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  if (!attempt) return null;
  assertOwner(session, attempt.userId);

  const [set] = await db.select().from(questionSets).where(eq(questionSets.id, attempt.setId)).limit(1);
  if (!set) return null;

  return buildState(attempt.id, set, await loadQuestions(attempt.setId), attempt.attemptNo, attempt.currentQuestionIndex);
}

/**
 * Records one answer and moves the resume point forward.
 *
 * `is_correct` is computed and stored here for chapter tests so the result screen and the
 * scorecard never have to re-derive it. Psychometric responses have no correct answer, so
 * it stays null and scoring happens from option_scores at submit time.
 */
export async function saveResponse(
  session: SessionScope,
  attemptId: string,
  questionId: string,
  selectedOption: string,
  nextQuestionIndex: number,
): Promise<void> {
  const db = getDb();

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  if (!attempt) throw new Error("Attempt not found");
  assertOwner(session, attempt.userId);
  if (attempt.status === "submitted") throw new Error("This attempt has already been submitted");

  const [question] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!question || question.setId !== attempt.setId) {
    throw new Error("That question is not part of this assessment");
  }
  if (!question.options.some((option) => option.key === selectedOption)) {
    throw new Error("That is not one of the options for this question");
  }

  const isCorrect = question.correctOption === null ? null : question.correctOption === selectedOption;

  await db
    .insert(responses)
    .values({ attemptId, questionId, selectedOption, isCorrect })
    .onConflictDoUpdate({
      target: [responses.attemptId, responses.questionId],
      set: { selectedOption, isCorrect },
    });

  await db
    .update(attempts)
    .set({ currentQuestionIndex: Math.max(nextQuestionIndex, 0) })
    .where(eq(attempts.id, attemptId));
}

export async function submitAttempt(session: SessionScope, attemptId: string): Promise<AttemptResult> {
  const db = getDb();

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  if (!attempt) throw new Error("Attempt not found");
  assertOwner(session, attempt.userId);

  const [set] = await db.select().from(questionSets).where(eq(questionSets.id, attempt.setId)).limit(1);
  if (!set) throw new Error("Question set not found");
  if (set.type === "setup") {
    throw new Error("The setup questionnaire is unscored and is not submitted through the engine");
  }

  const setQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.setId, attempt.setId))
    .orderBy(asc(questions.order));

  const saved = await db
    .select({ questionId: responses.questionId, selectedOption: responses.selectedOption, isCorrect: responses.isCorrect })
    .from(responses)
    .where(eq(responses.attemptId, attemptId));
  const answerByQuestion = new Map(saved.map((row) => [row.questionId, row]));

  let score = 0;
  let maxScore = 0;

  for (const question of setQuestions) {
    const answer = answerByQuestion.get(question.id);
    if (set.type === "chapter_test") {
      maxScore += 1;
      if (answer?.isCorrect) score += 1;
    } else {
      // Psychometric: the maximum is the best-scoring option, so the percentage reflects
      // how close the learner came to the strongest possible set of answers.
      const scores = question.optionScores ?? {};
      const values = Object.values(scores);
      maxScore += values.length > 0 ? Math.max(...values) : 0;
      if (answer) score += scores[answer.selectedOption] ?? 0;
    }
  }

  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const settings = await getCourseSettings();
  const passed = set.type === "chapter_test" ? percentage >= settings.passMarkPct : null;

  // Submitting twice must not double-count or reopen a finished attempt.
  if (attempt.status !== "submitted") {
    await db
      .update(attempts)
      .set({ status: "submitted", submittedAt: new Date(), score, maxScore, passed })
      .where(eq(attempts.id, attemptId));

    if (set.type === "chapter_test" && set.chapterId) {
      await recordChapterProgress(session.userId, set.chapterId, score, Boolean(passed));
    }
    if (set.type === "psychometric") {
      await recordPsychometricAnalysis(session.userId, percentage);
    }
  }

  return {
    attemptId,
    score,
    maxScore,
    percentage,
    passed,
    review: setQuestions.map((question) => ({
      question: {
        id: question.id,
        order: question.order,
        promptEn: question.promptEn,
        promptHi: question.promptHi,
        options: question.options,
      },
      selectedOption: answerByQuestion.get(question.id)?.selectedOption ?? null,
      correctOption: question.correctOption,
      isCorrect: answerByQuestion.get(question.id)?.isCorrect ?? null,
    })),
  };
}

// progress.test_score keeps the learner's *best* score, since docs/spec.md §7 says the
// scorecard shows the best attempt. A failed retake must never pull a passing score down.
async function recordChapterProgress(userId: string, chapterId: string, score: number, passed: boolean) {
  const db = getDb();

  await db
    .insert(progress)
    .values({
      userId,
      chapterId,
      status: passed ? "complete" : "in_progress",
      testScore: score,
      completedAt: passed ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [progress.userId, progress.chapterId],
      set: {
        // Cast explicitly: a bare CASE yields text, and progress.status is a Postgres enum.
        status: passed
          ? "complete"
          : sql`(case when ${progress.status} = 'complete' then 'complete' else 'in_progress' end)::progress_status`,
        testScore: sql`greatest(coalesce(${progress.testScore}, 0), ${score})`,
        completedAt: passed ? new Date() : sql`${progress.completedAt}`,
      },
    });
}

async function recordPsychometricAnalysis(userId: string, percentage: number) {
  const db = getDb();

  const [band] = await db
    .select()
    .from(analysisBands)
    .where(and(sql`${analysisBands.minPct} <= ${percentage}`, sql`${analysisBands.maxPct} >= ${percentage}`))
    .limit(1);

  // No matching band means the trainer's bands do not cover this score. The attempt is
  // still recorded; the analysis screen handles a missing analysis rather than failing
  // the submission the learner just completed.
  if (!band) return;

  await db.insert(analyses).values({ userId, psychometricScore: percentage, bandId: band.id });
}

/**
 * Reads a finished attempt without changing it.
 *
 * The result screen is a plain page view and must never submit anything, so it uses this
 * rather than submitAttempt -- otherwise navigating straight to a result URL would submit
 * an assessment the learner is still working through.
 */
export async function getSubmittedResult(
  session: SessionScope,
  attemptId: string,
): Promise<AttemptResult | null> {
  const db = getDb();

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  if (!attempt) return null;
  assertOwner(session, attempt.userId);
  if (attempt.status !== "submitted") return null;

  const setQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.setId, attempt.setId))
    .orderBy(asc(questions.order));

  const saved = await db
    .select({
      questionId: responses.questionId,
      selectedOption: responses.selectedOption,
      isCorrect: responses.isCorrect,
    })
    .from(responses)
    .where(eq(responses.attemptId, attemptId));
  const answerByQuestion = new Map(saved.map((row) => [row.questionId, row]));

  const score = attempt.score ?? 0;
  const maxScore = attempt.maxScore ?? 0;

  return {
    attemptId,
    score,
    maxScore,
    percentage: maxScore > 0 ? (score / maxScore) * 100 : 0,
    passed: attempt.passed,
    review: setQuestions.map((question) => ({
      question: {
        id: question.id,
        order: question.order,
        promptEn: question.promptEn,
        promptHi: question.promptHi,
        options: question.options,
      },
      selectedOption: answerByQuestion.get(question.id)?.selectedOption ?? null,
      correctOption: question.correctOption,
      isCorrect: answerByQuestion.get(question.id)?.isCorrect ?? null,
    })),
  };
}
