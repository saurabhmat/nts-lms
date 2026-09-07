"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function requestReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (email) {
    try {
      await auth.api.requestPasswordReset({ body: { email } });
    } catch {
      // Ignore -- always show the same generic message below so this endpoint
      // can't be used to discover which emails have accounts.
    }
  }

  redirect("/forgot-password?sent=1");
}
