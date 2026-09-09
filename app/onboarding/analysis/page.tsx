import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";

import { getLatestAnalysis, getOnboardingState } from "@/lib/onboarding";
import { getSessionScope } from "@/lib/session";

import { OnboardingSteps } from "../steps";
import { startCourseAction } from "./actions";

export default async function AnalysisPage() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const state = await getOnboardingState(scope.userId);
  if (state === "pending") redirect("/onboarding/psychometric");
  if (state === "psychometric_done") redirect("/onboarding/questionnaire");

  const analysis = await getLatestAnalysis(scope);

  return (
    <div>
      <OnboardingSteps current="analysis" />

      <div className="mx-auto max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Your assessment result</h1>

        {analysis ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold tracking-tight text-slate-900">
                {Math.round(analysis.percentage)}%
              </span>
              {analysis.band && (
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-sm font-medium text-blue-700">
                  {analysis.band.label}
                </span>
              )}
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600"
                style={{ width: `${Math.min(Math.max(analysis.percentage, 0), 100)}%` }}
              />
            </div>

            {analysis.band ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm leading-relaxed text-slate-800">{analysis.band.bodyEn}</p>
                <p className="border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">
                  {analysis.band.bodyHi}
                </p>
              </div>
            ) : (
              // A score outside every configured band. The engine records the attempt either
              // way rather than failing a submission the learner has already completed, so
              // the screen has to cope with the analysis text being absent.
              <p className="mt-5 text-sm text-slate-600">
                Your assessment has been recorded. Your trainer has not yet added the written
                analysis for this score range — it will appear here once they do.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Your assessment has been recorded, but no analysis is available yet.
          </p>
        )}

        <form action={startCourseAction} className="mt-6">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Start the course
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
