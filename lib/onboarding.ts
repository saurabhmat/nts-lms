import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  analyses,
  analysisBands,
  attempts,
  authUsers,
  questionSets,
  questions,
  setupAnswers,
} from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

// The onboarding funnel of docs/spec.md §5: psychometric -> setup questionnaire -> analysis,
// with `auth.users.onboarding_state` advancing at each step. The psychometric half runs
// entirely on the shared question engine; only the questionnaire needs its own path, because
// it is unscored and may be free text, so its answers live in `setup_answers` rather than in
// the scored `responses` table (the amendment in docs/spec.md §4).

export type OnboardingState = "pending" | "psychometric_done" | "questionnaire_done" | "complete";

export type SetupQuestion = {
  id: string;
  order: number;
  promptEn: string;
  promptHi: string;
  options: Array<{ key: string; en: string; hi: string }>;
  answer: string | null;
};

export type LearnerAnalysis = {
  percentage: number;
  generatedAt: Date;
  band: { label: string; bodyEn: string; bodyHi: string } | null;
};

export async function getQuestionSetByType(type: "psychometric" | "setup") {
  const db = getDb();
  const [set] = await db.select().from(questionSets).where(eq(questionSets.type, type)).limit(1);
  return set ?? null;
}

/**
 * True only when there is a psychometric set with at least one question in it.
 *
 * The onboarding gate depends on this. A database with no content yet -- which is exactly
 * what production looks like before the trainer's workbook is imported -- would otherwise
 * redirect every learner into a funnel they cannot possibly finish, locking them out of the
 * course entirely. See the gate in app/course/layout.tsx.
 */
export async function isOnboardingAvailable(): Promise<boolean> {
  const db = getDb();
  const set = await getQuestionSetByType("psychometric");
  if (!set) return false;

  const [question] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.setId, set.id))
    .limit(1);
  return Boolean(question);
}

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const db = getDb();
  const [user] = await db
    .select({ onboardingState: authUsers.onboardingState })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  return (user?.onboardingState as OnboardingState) ?? "pending";
}

/**
 * Advances onboarding, and never moves a learner backwards.
 *
 * Re-submitting a step (a double-clicked button, a replayed POST, a retaken psychometric)
 * must not undo progress the learner has already made.
 */
export async function advanceOnboardingState(userId: string, to: OnboardingState): Promise<void> {
  const order: OnboardingState[] = ["pending", "psychometric_done", "questionnaire_done", "complete"];
  const current = await getOnboardingState(userId);
  if (order.indexOf(to) <= order.indexOf(current)) return;

  const db = getDb();
  await db.update(authUsers).set({ onboardingState: to }).where(eq(authUsers.id, userId));
}

/** The route a learner should be on, given how far through onboarding they are. */
export function onboardingStepPath(state: OnboardingState): string {
  switch (state) {
    case "pending":
      return "/onboarding/psychometric";
    case "psychometric_done":
      return "/onboarding/questionnaire";
    case "questionnaire_done":
      return "/onboarding/analysis";
    case "complete":
      return "/course";
  }
}

export async function getSetupQuestions(session: SessionScope): Promise<SetupQuestion[]> {
  const db = getDb();
  const set = await getQuestionSetByType("setup");
  if (!set) return [];

  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.setId, set.id))
    .orderBy(asc(questions.order));

  const saved = await db
    .select({ questionId: setupAnswers.questionId, answer: setupAnswers.answer })
    .from(setupAnswers)
    .where(
      and(
        eq(setupAnswers.userId, session.userId),
        inArray(
          setupAnswers.questionId,
          rows.map((row) => row.id),
        ),
      ),
    );
  const answerByQuestion = new Map(saved.map((row) => [row.questionId, row.answer]));

  return rows.map((row) => ({
    id: row.id,
    order: row.order,
    promptEn: row.promptEn,
    promptHi: row.promptHi,
    options: row.options,
    answer: answerByQuestion.get(row.id) ?? null,
  }));
}

/**
 * Saves the questionnaire and advances the learner to `questionnaire_done`.
 *
 * Answers are keyed on (user, question) and upserted, so returning to the questionnaire
 * edits the previous answers rather than accumulating duplicates. Every answer is checked
 * against a question that genuinely belongs to the setup set -- this runs from a Server
 * Action, which is a public POST endpoint, so the question ids arriving here are untrusted.
 */
export async function saveSetupAnswers(
  session: SessionScope,
  answers: Array<{ questionId: string; answer: string }>,
): Promise<void> {
  const db = getDb();
  const set = await getQuestionSetByType("setup");
  if (!set) throw new Error("The setup questionnaire has no questions yet");

  const rows = await db
    .select({ id: questions.id, options: questions.options })
    .from(questions)
    .where(eq(questions.setId, set.id));
  const byId = new Map(rows.map((row) => [row.id, row]));

  const cleaned = answers
    .map((entry) => ({ questionId: entry.questionId, answer: entry.answer.trim() }))
    .filter((entry) => entry.answer.length > 0);

  for (const entry of cleaned) {
    const question = byId.get(entry.questionId);
    if (!question) throw new Error("That question is not part of the setup questionnaire");
    // A multiple-choice answer must be one of the offered keys. Free-text questions carry an
    // empty options array and accept any non-empty text.
    if (question.options.length > 0 && !question.options.some((option) => option.key === entry.answer)) {
      throw new Error("That is not one of the options for this question");
    }
  }

  const required = rows.length;
  if (cleaned.length < required) {
    throw new Error("Please answer every question before continuing");
  }

  for (const entry of cleaned) {
    await db
      .insert(setupAnswers)
      .values({ userId: session.userId, questionId: entry.questionId, answer: entry.answer })
      .onConflictDoUpdate({
        target: [setupAnswers.userId, setupAnswers.questionId],
        set: { answer: entry.answer, updatedAt: new Date() },
      });
  }

  await advanceOnboardingState(session.userId, "questionnaire_done");
}

/** The learner's most recent psychometric analysis, with the band text to show them. */
export async function getLatestAnalysis(session: SessionScope): Promise<LearnerAnalysis | null> {
  const db = getDb();
  const [row] = await db
    .select({
      percentage: analyses.psychometricScore,
      generatedAt: analyses.generatedAt,
      label: analysisBands.label,
      bodyEn: analysisBands.bodyEn,
      bodyHi: analysisBands.bodyHi,
    })
    .from(analyses)
    .leftJoin(analysisBands, eq(analyses.bandId, analysisBands.id))
    .where(eq(analyses.userId, session.userId))
    .orderBy(desc(analyses.generatedAt))
    .limit(1);

  if (!row) return null;

  return {
    percentage: row.percentage,
    generatedAt: row.generatedAt,
    band: row.label ? { label: row.label, bodyEn: row.bodyEn!, bodyHi: row.bodyHi! } : null,
  };
}

/** Whether this learner has a submitted psychometric attempt, regardless of onboarding state. */
export async function hasSubmittedPsychometric(session: SessionScope): Promise<boolean> {
  const db = getDb();
  const set = await getQuestionSetByType("psychometric");
  if (!set) return false;

  const [attempt] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, session.userId),
        eq(attempts.setId, set.id),
        eq(attempts.status, "submitted"),
      ),
    )
    .limit(1);
  return Boolean(attempt);
}
