import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AssessmentPlayer } from "@/components/assessment-player";
import { auth } from "@/lib/auth";
import { startOrResumeAttempt } from "@/lib/engine";
import { getOnboardingState, getQuestionSetByType } from "@/lib/onboarding";
import { getSessionScope } from "@/lib/session";

import { OnboardingSteps } from "../steps";
import { savePsychometricAnswerAction, submitPsychometricAction } from "./actions";

export default async function PsychometricPage() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  // Already past this step: don't let a learner re-take the assessment by URL and overwrite
  // the analysis their result screen is showing them.
  const state = await getOnboardingState(scope.userId);
  if (state !== "pending") redirect("/onboarding");

  const set = await getQuestionSetByType("psychometric");
  if (!set) redirect("/course");

  let attempt;
  try {
    attempt = await startOrResumeAttempt(scope, set.id);
  } catch {
    redirect("/course");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const initialLanguage = session?.user.preferredLanguage === "hi" ? "hi" : "en";

  return (
    <div>
      <OnboardingSteps current="psychometric" />

      <div className="mx-auto mb-6 max-w-2xl">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          Before you start the course
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          A short assessment of how you sell today. There are no right or wrong answers — answer
          honestly and your result will point you at what to focus on. You can switch between
          English and Hindi at any time.
        </p>
      </div>

      <AssessmentPlayer
        state={attempt}
        title={set.title}
        initialLanguage={initialLanguage}
        submitLabel="Submit assessment"
        doneHref="/onboarding/questionnaire"
        saveAnswer={savePsychometricAnswerAction}
        submitAttempt={submitPsychometricAction}
      />
    </div>
  );
}
