import { and, eq, type SQL } from "drizzle-orm";

import { users } from "@/db/schema";

export type SessionScope = {
  userId: string;
  role: "master" | "company_admin" | "learner";
  organizationId: string | null;
};

export function organizationUserWhere(
  session: SessionScope,
  requestedOrganizationId?: string,
): SQL | undefined {
  if (session.role === "master") {
    return requestedOrganizationId
      ? eq(users.organizationId, requestedOrganizationId)
      : undefined;
  }

  if (!session.organizationId) {
    throw new Error("An organization is required for this role");
  }

  if (requestedOrganizationId && requestedOrganizationId !== session.organizationId) {
    throw new Error("Organization scope does not match the current session");
  }

  const organizationFilter = eq(users.organizationId, session.organizationId);
  return session.role === "learner"
    ? and(organizationFilter, eq(users.id, session.userId))
    : organizationFilter;
}

export function requireOrganizationId(session: SessionScope): string {
  if (!session.organizationId) {
    throw new Error("This operation requires an organization");
  }

  return session.organizationId;
}
