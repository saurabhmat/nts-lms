"use server";

import { redirect } from "next/navigation";

import { getSetupQuestions, saveSetupAnswers } from "@/lib/onboarding";
import { getSessionScope } from "@/lib/session";

/**
 * Saves the questionnaire from a plain form POST.
 *
 * The form is a no-JS server-action form, so the answers arrive as FormData keyed by question
 * id. The question ids are read back from the database rather than trusted from the payload:
 * a Server Action is a public endpoint, and `saveSetupAnswers` rejects any id that is not
 * part of the setup set.
 */
export async function saveQuestionnaireAction(formData: FormData) {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const setupQuestions = await getSetupQuestions(scope);
  const answers = setupQuestions.map((question) => ({
    questionId: question.id,
    answer: String(formData.get(`q:${question.id}`) ?? ""),
  }));

  try {
    await saveSetupAnswers(scope, answers);
  } catch (error) {
    redirect(`/onboarding/questionnaire?error=${encodeURIComponent((error as Error).message)}`);
  }

  redirect("/onboarding/analysis");
}
