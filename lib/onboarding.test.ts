import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

import {
  advanceOnboardingState,
  getLatestAnalysis,
  getOnboardingState,
  getSetupQuestions,
  hasSubmittedPsychometric,
  isOnboardingAvailable,
  onboardingStepPath,
  saveSetupAnswers,
} from "./onboarding";

const db = getDb();
const suffix = randomUUID().slice(0, 8);
const learnerId = `onb-learner-${suffix}`;
const otherId = `onb-other-${suffix}`;
const learner: SessionScope = { userId: learnerId, role: "learner", organizationId: null };
const other: SessionScope = { userId: otherId, role: "learner", organizationId: null };

const CHOICE_OPTIONS = [
  { key: "A", en: "Just me", hi: "केवल मैं" },
  { key: "B", en: "A team", hi: "एक टीम" },
];

let setupSetId: string;
let psychometricSetId: string;
let freeTextQuestionId: string;
let choiceQuestionId: string;
let strayQuestionId: string;

// These helpers look their question set up by type, so any other psychometric or setup set in
// the database would make the results ambiguous. The seeded placeholder content
// (npm run db:seed:content) is exactly such a set, so this suite removes them and builds its
// own -- re-run the content seed afterwards to get the dev data back.
async function cleanup() {
  await db.delete(authUsers).where(inArray(authUsers.id, [learnerId, otherId]));
  if (setupSetId) await db.delete(questionSets).where(eq(questionSets.id, setupSetId));
  if (psychometricSetId) await db.delete(questionSets).where(eq(questionSets.id, psychometricSetId));
}

beforeAll(async () => {
  await db.delete(questionSets).where(inArray(questionSets.type, ["psychometric", "setup"]));
  await cleanup();

  await db.insert(authUsers).values([
    { id: learnerId, name: "Onboarding Learner", email: `onb-learner-${suffix}@example.com` },
    { id: otherId, name: "Other Learner", email: `onb-other-${suffix}@example.com` },
  ]);

  const [setupSet] = await db
    .insert(questionSets)
    .values({ type: "setup", chapterId: null, title: "Setup" })
    .returning({ id: questionSets.id });
  setupSetId = setupSet.id;

  const inserted = await db
    .insert(questions)
    .values([
      { setId: setupSet.id, order: 1, promptEn: "What do you sell?", promptHi: "आप क्या बेचते हैं?", options: [] },
      { setId: setupSet.id, order: 2, promptEn: "Team size?", promptHi: "टीम का आकार?", options: CHOICE_OPTIONS },
    ])
    .returning({ id: questions.id, order: questions.order });
  freeTextQuestionId = inserted.find((row) => row.order === 1)!.id;
  choiceQuestionId = inserted.find((row) => row.order === 2)!.id;

  const [psySet] = await db
    .insert(questionSets)
    .values({ type: "psychometric", chapterId: null, title: "Psychometric" })
    .returning({ id: questionSets.id });
  psychometricSetId = psySet.id;

  const [stray] = await db
    .insert(questions)
    .values({
      setId: psySet.id,
      order: 1,
      promptEn: "P1",
      promptHi: "प1",
      options: CHOICE_OPTIONS,
      optionScores: { A: 1, B: 3 },
    })
    .returning({ id: questions.id });
  strayQuestionId = stray.id;
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.delete(setupAnswers).where(inArray(setupAnswers.userId, [learnerId, otherId]));
  await db.delete(analyses).where(inArray(analyses.userId, [learnerId, otherId]));
  await db.delete(attempts).where(inArray(attempts.userId, [learnerId, otherId]));
  await db
    .update(authUsers)
    .set({ onboardingState: "pending" })
    .where(inArray(authUsers.id, [learnerId, otherId]));
});

describe("onboarding state", () => {
  it("starts pending and advances forward", async () => {
    expect(await getOnboardingState(learnerId)).toBe("pending");

    await advanceOnboardingState(learnerId, "psychometric_done");
    expect(await getOnboardingState(learnerId)).toBe("psychometric_done");

    await advanceOnboardingState(learnerId, "complete");
    expect(await getOnboardingState(learnerId)).toBe("complete");
  });

  // A replayed POST or a double-clicked button must never undo progress.
  it("never moves a learner backwards", async () => {
    await advanceOnboardingState(learnerId, "questionnaire_done");
    await advanceOnboardingState(learnerId, "psychometric_done");
    expect(await getOnboardingState(learnerId)).toBe("questionnaire_done");

    await advanceOnboardingState(learnerId, "questionnaire_done");
    expect(await getOnboardingState(learnerId)).toBe("questionnaire_done");
  });

  it("maps each state to the step the learner belongs on", () => {
    expect(onboardingStepPath("pending")).toBe("/onboarding/psychometric");
    expect(onboardingStepPath("psychometric_done")).toBe("/onboarding/questionnaire");
    expect(onboardingStepPath("questionnaire_done")).toBe("/onboarding/analysis");
    expect(onboardingStepPath("complete")).toBe("/course");
  });
});

describe("onboarding availability", () => {
  it("is available when a psychometric set has questions", async () => {
    expect(await isOnboardingAvailable()).toBe(true);
  });

  // The gate in app/course/layout.tsx depends on this: with no content loaded there is no
  // funnel to complete, and gating anyway would lock every learner out of the course.
  it("is unavailable when the psychometric set has no questions", async () => {
    await db.delete(questions).where(eq(questions.id, strayQuestionId));
    expect(await isOnboardingAvailable()).toBe(false);

    const [restored] = await db
      .insert(questions)
      .values({
        setId: psychometricSetId,
        order: 1,
        promptEn: "P1",
        promptHi: "प1",
        options: CHOICE_OPTIONS,
        optionScores: { A: 1, B: 3 },
      })
      .returning({ id: questions.id });
    strayQuestionId = restored.id;
  });
});

describe("setup questionnaire", () => {
  it("saves answers, advances state, and reads them back", async () => {
    await saveSetupAnswers(learner, [
      { questionId: freeTextQuestionId, answer: "Industrial pumps to factories" },
      { questionId: choiceQuestionId, answer: "B" },
    ]);

    expect(await getOnboardingState(learnerId)).toBe("questionnaire_done");

    const readBack = await getSetupQuestions(learner);
    expect(readBack.find((q) => q.id === freeTextQuestionId)?.answer).toBe("Industrial pumps to factories");
    expect(readBack.find((q) => q.id === choiceQuestionId)?.answer).toBe("B");
  });

  // Returning to the questionnaire must edit the previous answers, not accumulate duplicates.
  it("upserts rather than duplicating on re-submission", async () => {
    await saveSetupAnswers(learner, [
      { questionId: freeTextQuestionId, answer: "First answer" },
      { questionId: choiceQuestionId, answer: "A" },
    ]);
    await saveSetupAnswers(learner, [
      { questionId: freeTextQuestionId, answer: "Second answer" },
      { questionId: choiceQuestionId, answer: "B" },
    ]);

    const rows = await db.select().from(setupAnswers).where(eq(setupAnswers.userId, learnerId));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.questionId === freeTextQuestionId)?.answer).toBe("Second answer");
  });

  it("requires every question to be answered", async () => {
    await expect(
      saveSetupAnswers(learner, [{ questionId: freeTextQuestionId, answer: "Only one" }]),
    ).rejects.toThrow(/answer every question/i);
    expect(await getOnboardingState(learnerId)).toBe("pending");
  });

  it("treats whitespace as unanswered", async () => {
    await expect(
      saveSetupAnswers(learner, [
        { questionId: freeTextQuestionId, answer: "   " },
        { questionId: choiceQuestionId, answer: "A" },
      ]),
    ).rejects.toThrow(/answer every question/i);
  });

  // A Server Action is a public POST endpoint, so the ids and values arriving here are
  // untrusted and must be checked against the set rather than accepted.
  it("rejects a question that is not part of the setup set", async () => {
    await expect(
      saveSetupAnswers(learner, [
        { questionId: freeTextQuestionId, answer: "ok" },
        { questionId: strayQuestionId, answer: "A" },
      ]),
    ).rejects.toThrow(/not part of the setup questionnaire/i);
  });

  it("rejects an option that the choice question does not offer", async () => {
    await expect(
      saveSetupAnswers(learner, [
        { questionId: freeTextQuestionId, answer: "ok" },
        { questionId: choiceQuestionId, answer: "Z" },
      ]),
    ).rejects.toThrow(/not one of the options/i);
  });

  it("never returns another learner's answers", async () => {
    await saveSetupAnswers(learner, [
      { questionId: freeTextQuestionId, answer: "Learner's private answer" },
      { questionId: choiceQuestionId, answer: "A" },
    ]);

    const forOther = await getSetupQuestions(other);
    expect(forOther.every((question) => question.answer === null)).toBe(true);
  });
});

describe("analysis read-back", () => {
  it("returns the most recent analysis with its band text", async () => {
    await db.delete(analysisBands);
    const [band] = await db
      .insert(analysisBands)
      .values({ minPct: 0, maxPct: 100, label: "Proficient", bodyEn: "EN body", bodyHi: "HI body" })
      .returning({ id: analysisBands.id });

    await db.insert(analyses).values({
      userId: learnerId,
      psychometricScore: 40,
      bandId: band.id,
      generatedAt: new Date(Date.now() - 60_000),
    });
    await db.insert(analyses).values({ userId: learnerId, psychometricScore: 75, bandId: band.id });

    const analysis = await getLatestAnalysis(learner);
    expect(analysis?.percentage).toBe(75);
    expect(analysis?.band?.label).toBe("Proficient");
    expect(analysis?.band?.bodyHi).toBe("HI body");

    expect(await getLatestAnalysis(other)).toBeNull();
  });
});

describe("psychometric completion", () => {
  it("reports a submitted psychometric attempt", async () => {
    expect(await hasSubmittedPsychometric(learner)).toBe(false);

    await db.insert(attempts).values({
      userId: learnerId,
      setId: psychometricSetId,
      attemptNo: 1,
      status: "submitted",
      submittedAt: new Date(),
    });

    expect(await hasSubmittedPsychometric(learner)).toBe(true);
    expect(await hasSubmittedPsychometric(other)).toBe(false);
  });
});
