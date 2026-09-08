"use server";

import { redirect } from "next/navigation";

import { saveResponse, submitAttempt } from "@/lib/engine";
import { getSessionScope } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; message: string };
export type SubmitResult = { ok: true; attemptId: string } | { ok: false; message: string };

// Every action re-derives the session and the engine re-checks attempt ownership, because
// a Server Action is a public POST endpoint: rendering the player behind a gate is not a
// security boundary (see node_modules/next/dist/docs/01-app/02-guides/server-actions.md).

export async function saveAnswerAction(
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

export async function submitAttemptAction(attemptId: string): Promise<SubmitResult> {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  try {
    const result = await submitAttempt(scope, attemptId);
    return { ok: true, attemptId: result.attemptId };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
