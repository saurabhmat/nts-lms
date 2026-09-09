import { redirect } from "next/navigation";

import { getOnboardingState, isOnboardingAvailable } from "@/lib/onboarding";
import { getSessionScope } from "@/lib/session";

// The root is a router, not a page. Until now it was still the Next.js scaffold: every flow
// redirects to /login or a role home directly, so nobody inside the app ever landed here --
// but anyone typing the bare domain got "To get started, edit page.tsx", in production.
//
// The destinations mirror app/login/actions.ts, so signing in and visiting the root land a
// user in the same place.
export default async function Home() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  if (scope.role === "master") redirect("/admin");
  if (scope.role === "company_admin") redirect("/team");

  if (await isOnboardingAvailable()) {
    const state = await getOnboardingState(scope.userId);
    if (state !== "complete") redirect("/onboarding");
  }

  redirect("/course");
}
