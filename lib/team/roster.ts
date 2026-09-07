import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { authInvitations, authOrganizations, authUsers } from "@/db/schema";
import { inviteIntoOrganization } from "@/lib/admin/companies";
import { organizationUserWhere, requireOrganizationId, type SessionScope } from "@/lib/db/org-scope";

function assertCompanyAdmin(session: SessionScope) {
  if (session.role !== "company_admin") {
    throw new Error("Only a company admin can view this roster");
  }
}

export async function getMyOrganization(session: SessionScope) {
  assertCompanyAdmin(session);
  const organizationId = requireOrganizationId(session);
  const db = getDb();

  const [organization] = await db
    .select()
    .from(authOrganizations)
    .where(eq(authOrganizations.id, organizationId))
    .limit(1);

  return organization ?? null;
}

export async function getMyOrganizationRoster(session: SessionScope) {
  assertCompanyAdmin(session);
  requireOrganizationId(session);
  const db = getDb();

  // Uses the shared org-scope helper rather than a raw organizationId filter --
  // see docs/spec.md §2: every organisation-scoped query must go through it.
  const where = organizationUserWhere(session);

  return db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      onboardingState: authUsers.onboardingState,
    })
    .from(authUsers)
    .where(where)
    .orderBy(authUsers.name);
}

export async function listPendingInvitationsForMyOrganization(session: SessionScope) {
  assertCompanyAdmin(session);
  const organizationId = requireOrganizationId(session);
  const db = getDb();

  return db
    .select()
    .from(authInvitations)
    .where(and(eq(authInvitations.organizationId, organizationId), eq(authInvitations.status, "pending")))
    .orderBy(desc(authInvitations.createdAt));
}

// A company admin can only ever invite plain learners into their own organization --
// never another company_admin (that stays master-only, via inviteCompanyOwner in
// lib/admin/companies.ts) -- so "learner" is hardcoded here rather than accepted as a
// parameter.
export async function inviteLearnersIntoMyOrganization(
  session: SessionScope,
  inviterId: string,
  emails: string[],
) {
  assertCompanyAdmin(session);
  const organizationId = requireOrganizationId(session);
  return inviteIntoOrganization(organizationId, inviterId, emails, "learner");
}
