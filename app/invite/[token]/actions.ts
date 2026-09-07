"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { finalizeInvitationAcceptance, getPendingInvitationByToken } from "@/lib/invitations";
import { auth } from "@/lib/auth";

export async function acceptInvitationAction(token: string, formData: FormData) {
  const invitation = await getPendingInvitationByToken(token);
  if (!invitation) {
    redirect(`/invite/${token}?error=${encodeURIComponent("This invitation is invalid or has expired")}`);
  }

  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!name || !password) {
    redirect(`/invite/${token}?error=${encodeURIComponent("All fields are required")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/invite/${token}?error=${encodeURIComponent("Passwords do not match")}`);
  }

  let newUserId: string | null = null;
  let failMessage: string | null = null;
  try {
    const result = await auth.api.signUpEmail({
      body: { email: invitation.email, password, name },
      headers: await headers(),
    });
    newUserId = result.user.id;
  } catch {
    failMessage = "An account with this email may already exist. Try signing in instead.";
  }

  if (failMessage || !newUserId) {
    redirect(`/invite/${token}?error=${encodeURIComponent(failMessage ?? "Could not create account")}`);
  }

  try {
    await finalizeInvitationAcceptance(token, invitation.email, newUserId);
  } catch (error) {
    redirect(
      `/invite/${token}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Could not join the organization",
      )}`,
    );
  }

  redirect(`/invite/${token}?accepted=1`);
}
