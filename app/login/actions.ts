"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getOnboardingState, isOnboardingAvailable } from "@/lib/onboarding";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  let role: string | undefined;
  let userId: string | undefined;
  let failed = false;
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    role = result.user.role;
    userId = result.user.id;
  } catch {
    failed = true;
  }

  if (failed) {
    redirect("/login?error=1");
  }

  if (role === "master") redirect("/admin");
  if (role === "company_admin") redirect("/team");

  // A learner mid-onboarding lands in the funnel rather than on the course, which would only
  // bounce them back here anyway. The user id comes from the sign-in result rather than from
  // the session, because the new session cookie is only on the outgoing response and is not
  // readable within this same request.
  if (userId && (await isOnboardingAvailable())) {
    const state = await getOnboardingState(userId);
    if (state !== "complete") redirect("/onboarding");
  }

  redirect("/course");
}
