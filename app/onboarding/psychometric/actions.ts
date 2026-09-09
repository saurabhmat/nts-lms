"use server";

import { redirect } from "next/navigation";

import { saveResponse, submitAttempt } from "@/lib/engine";
import { advanceOnboardingState } from "@/lib/onboarding";
import { getSessionScope } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; message: string };
export type SubmitResult = { ok: true; attemptId: string } | { ok: false; message: string };

// Every action re-derives the session and the engine re-checks attempt ownership, because a
// Server Action is a public POST endpoint: rendering the player behind a gate is not a
// security boundary (see node_modules/next/dist/docs/01-app/02-guides/server-actions.md).

export async function savePsychometricAnswerAction(
  attemptId: string,
  questionId: string,
  selectedOption: string,
  nextQuestionIndex: number,
): Promise<ActionResult> {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  try {
    await saveResponse(scope, attemptId, questionId, selectedOption, nextQuestionIndex);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/**
 * Submits the psychometric and moves the learner on to the questionnaire.
 *
 * The onboarding transition lives here rather than in the engine: the engine is shared with
 * chapter tests and must stay unaware of the funnel. Scoring and the analysis row are the
 * engine's job; deciding what that means for onboarding is this flow's job.
 */
export async function submitPsychometricAction(attemptId: string): Promise<SubmitResult> {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  try {
    const result = await submitAttempt(scope, attemptId);
    await advanceOnboardingState(scope.userId, "psychometric_done");
    return { ok: true, attemptId: result.attemptId };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
