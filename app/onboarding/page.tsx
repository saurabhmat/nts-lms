import { redirect } from "next/navigation";

import { getOnboardingState, isOnboardingAvailable, onboardingStepPath } from "@/lib/onboarding";
import { getSessionScope } from "@/lib/session";

// The funnel's entry point: sends the learner to whichever step they are actually on, so
// /onboarding is a safe place to redirect to from anywhere without knowing their state.
export default async function OnboardingIndexPage() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  // With no content loaded there is no assessment to take, so there is nothing to gate on.
  if (!(await isOnboardingAvailable())) redirect("/course");

  redirect(onboardingStepPath(await getOnboardingState(scope.userId)));
}
