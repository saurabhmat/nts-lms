"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  let signedIn = true;
  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch {
    signedIn = false;
  }

  if (!signedIn) {
    redirect("/login?error=1");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session?.user.role === "master" ? "/admin" : "/");
}
