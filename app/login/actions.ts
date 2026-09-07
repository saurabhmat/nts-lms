"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  let role: string | undefined;
  let failed = false;
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    role = result.user.role;
  } catch {
    failed = true;
  }

  if (failed) {
    redirect("/login?error=1");
  }

  if (role === "master") redirect("/admin");
  if (role === "company_admin") redirect("/team");
  redirect("/");
}
