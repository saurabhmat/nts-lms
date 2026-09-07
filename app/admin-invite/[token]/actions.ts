"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { finalizeAdminInvitationAcceptance, getPendingAdminInvitationByToken } from "@/lib/admin/team";
import { auth } from "@/lib/auth";

export async function acceptAdminInvitationAction(token: string, formData: FormData) {
  const invitation = await getPendingAdminInvitationByToken(token);
  if (!invitation) {
    redirect(`/admin-invite/${token}?error=${encodeURIComponent("This invitation is invalid or has expired")}`);
  }

  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!name || !password) {
    redirect(`/admin-invite/${token}?error=${encodeURIComponent("All fields are required")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/admin-invite/${token}?error=${encodeURIComponent("Passwords do not match")}`);
  }

  let failed = false;
  let failMessage = "Could not create account";
  try {
    await auth.api.signUpEmail({
      body: { email: invitation.email, password, name },
      headers: await headers(),
    });
  } catch (error) {
    failed = true;
    failMessage = error instanceof Error ? error.message : failMessage;
  }

  if (failed) {
    redirect(`/admin-invite/${token}?error=${encodeURIComponent(failMessage)}`);
  }

  await finalizeAdminInvitationAcceptance(token, invitation.email);

  redirect("/admin");
}
