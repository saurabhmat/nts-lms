import { redirect } from "next/navigation";

import { getOnboardingState, getSetupQuestions } from "@/lib/onboarding";
import { getSessionScope } from "@/lib/session";

import { OnboardingSteps } from "../steps";
import { saveQuestionnaireAction } from "./actions";

export default async function QuestionnairePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const state = await getOnboardingState(scope.userId);
  if (state === "pending") redirect("/onboarding/psychometric");
  if (state === "complete") redirect("/course");

  const setupQuestions = await getSetupQuestions(scope);

  // No setup questions loaded: skip rather than trap the learner on an empty form. The
  // questionnaire is content the trainer supplies, and it may legitimately not exist yet.
  if (setupQuestions.length === 0) redirect("/onboarding/analysis");

  return (
    <div>
      <OnboardingSteps current="questionnaire" />

      <div className="mx-auto max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Your current sales setup</h1>
        <p className="mt-1 text-sm text-slate-600">
          This tells your trainer where you are starting from. It is not scored.
        </p>

        {error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {/*
          A plain server-action form: the whole questionnaire is submitted at once and the
          answers are upserted, so returning to this page edits the previous answers rather
          than adding duplicates. Deliberately not one-question-per-screen like the
          psychometric -- docs/spec.md §5 only requires that for the assessment, and a short
          form with free-text fields is faster to complete in one pass.
        */}
        <form action={saveQuestionnaireAction} className="mt-6 space-y-4">
          {setupQuestions.map((question, index) => (
            <div key={question.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <label htmlFor={`q:${question.id}`} className="block text-sm font-medium text-slate-900">
                <span className="mr-1.5 text-slate-400">{index + 1}.</span>
                {question.promptEn}
              </label>
              <p className="mt-1 text-xs text-slate-500">{question.promptHi}</p>

              {question.options.length === 0 ? (
                <textarea
                  id={`q:${question.id}`}
                  name={`q:${question.id}`}
                  defaultValue={question.answer ?? ""}
                  required
                  rows={3}
                  className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              ) : (
                <div className="mt-3 space-y-2">
                  {question.options.map((option) => (
                    <label
                      key={option.key}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:border-slate-300 hover:bg-slate-50 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"
                    >
                      <input
                        type="radio"
                        name={`q:${question.id}`}
                        value={option.key}
                        defaultChecked={question.answer === option.key}
                        required
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                      />
                      <span className="text-sm text-slate-800">
                        {option.en}
                        <span className="block text-xs text-slate-500">{option.hi}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Save and see my result
          </button>
        </form>
      </div>
    </div>
  );
}
