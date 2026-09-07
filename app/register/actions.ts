"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { authUsers } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function register(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const code = String(formData.get("code") ?? "");

  const expectedCode = process.env.REGISTRATION_CODE;
  if (!expectedCode || code !== expectedCode) {
    redirect(`/register?error=${encodeURIComponent("Invalid registration code")}`);
  }
  if (!name || !email || !password) {
    redirect(`/register?error=${encodeURIComponent("All fields are required")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/register?error=${encodeURIComponent("Passwords do not match")}`);
  }

  let failed = false;
  let failMessage = "Could not create account";
  try {
    await auth.api.signUpEmail({ body: { email, password, name }, headers: await headers() });
  } catch (error) {
    failed = true;
    failMessage = error instanceof Error ? error.message : failMessage;
  }

  if (failed) {
    redirect(`/register?error=${encodeURIComponent(failMessage)}`);
  }

  const db = getDb();
  await db.update(authUsers).set({ role: "master" }).where(eq(authUsers.email, email));

  redirect("/admin");
}
