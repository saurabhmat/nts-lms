import { and, eq, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { authMembers, authUsers } from "@/db/schema";

export type SessionScope = {
  userId: string;
  role: "master" | "company_admin" | "learner";
  organizationId: string | null;
};

export function organizationScopeWhere(
  table: { organizationId: AnyColumn },
  session: SessionScope,
  requestedOrganizationId?: string,
  userIdColumn?: AnyColumn,
): SQL | undefined {
  if (session.role === "master") {
    return requestedOrganizationId
      ? eq(table.organizationId, requestedOrganizationId)
      : undefined;
  }

  if (!session.organizationId) {
    throw new Error("An organization is required for this role");
  }

  if (requestedOrganizationId && requestedOrganizationId !== session.organizationId) {
    throw new Error("Organization scope does not match the current session");
  }

  const organizationFilter = eq(table.organizationId, session.organizationId);
  return session.role === "learner" && userIdColumn
    ? and(organizationFilter, eq(userIdColumn, session.userId))
    : organizationFilter;
}

export function organizationUserWhere(
  session: SessionScope,
  requestedOrganizationId?: string,
): SQL | undefined {
  if (
    session.role !== "master" &&
    requestedOrganizationId &&
    requestedOrganizationId !== session.organizationId
  ) {
    throw new Error("Organization scope does not match the current session");
  }

  const userFilter = session.role === "learner" ? eq(authUsers.id, session.userId) : undefined;

  if (session.role === "learner" && !session.organizationId) {
    return userFilter;
  }

  const organizationId = requestedOrganizationId ?? session.organizationId;
  if (!organizationId) {
    return session.role === "master" ? userFilter : undefined;
  }

  const membershipFilter = sql`exists (
    select 1 from ${authMembers}
    where ${eq(authMembers.userId, authUsers.id)}
      and ${eq(authMembers.organizationId, organizationId)}
  )`;

  return userFilter ? and(membershipFilter, userFilter) : membershipFilter;
}

export function requireOrganizationId(session: SessionScope): string {
  if (!session.organizationId) {
    throw new Error("This operation requires an organization");
  }

  return session.organizationId;
}
