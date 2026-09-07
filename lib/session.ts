import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { getDb } from "@/db";
import { authMembers } from "@/db/schema";
import { auth } from "@/lib/auth";
import type { SessionScope } from "@/lib/db/org-scope";

export async function getSessionScope(): Promise<SessionScope | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const role = session.user.role as SessionScope["role"];
  if (role === "master") {
    return { userId: session.user.id, role, organizationId: null };
  }

  const db = getDb();
  const [membership] = await db
    .select({ organizationId: authMembers.organizationId })
    .from(authMembers)
    .where(eq(authMembers.userId, session.user.id))
    .limit(1);

  return {
    userId: session.user.id,
    role,
    organizationId: membership?.organizationId ?? null,
  };
}
