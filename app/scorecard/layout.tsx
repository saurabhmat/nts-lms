import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LearnerShell } from "@/components/learner-shell";
import { auth } from "@/lib/auth";
import { getOnboardingState, isOnboardingAvailable } from "@/lib/onboarding";
import { getSessionScope } from "@/lib/session";

// Same gate as the course: a learner mid-onboarding has no scorecard to look at yet.
export default async function ScorecardLayout({ children }: { children: React.ReactNode }) {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  if (scope.role === "learner") {
    const state = await getOnboardingState(scope.userId);
    if (state !== "complete" && (await isOnboardingAvailable())) redirect("/onboarding");
  }

  const session = await auth.api.getSession({ headers: await headers() });

  return <LearnerShell userName={session?.user.name}>{children}</LearnerShell>;
}
