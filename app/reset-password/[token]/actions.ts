"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function resetPasswordAction(token: string, formData: FormData) {
  const newPassword = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmPassword) {
    redirect(`/reset-password/${token}?error=${encodeURIComponent("Passwords do not match")}`);
  }

  let failed = false;
  try {
    await auth.api.resetPassword({ body: { newPassword, token } });
  } catch {
    failed = true;
  }

  if (failed) {
    redirect(
      `/reset-password/${token}?error=${encodeURIComponent("This reset link is invalid or expired")}`,
    );
  }

  redirect("/login?reset=1");
}
