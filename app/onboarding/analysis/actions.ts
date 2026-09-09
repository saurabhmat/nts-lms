"use server";

import { redirect } from "next/navigation";

import { advanceOnboardingState } from "@/lib/onboarding";
import { getSessionScope } from "@/lib/session";

/** The end of the funnel: marks onboarding complete, which is what opens the course. */
export async function startCourseAction() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  await advanceOnboardingState(scope.userId, "complete");
  redirect("/course");
}
