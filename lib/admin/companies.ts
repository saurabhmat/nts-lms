import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { authInvitations, authMembers, authOrganizations, authUsers } from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function assertMaster(session: SessionScope) {
  if (session.role !== "master") {
    throw new Error("Only the master role can manage companies");
  }
}

export async function listCompanies(session: SessionScope) {
  assertMaster(session);
  const db = getDb();
  return db.select().from(authOrganizations).orderBy(desc(authOrganizations.createdAt));
}

export async function createCompany(
  session: SessionScope,
  input: { name: string; slug: string; seatLimit?: number },
) {
  assertMaster(session);
  const db = getDb();

  const [existing] = await db
    .select({ id: authOrganizations.id })
    .from(authOrganizations)
    .where(eq(authOrganizations.slug, input.slug))
    .limit(1);
  if (existing) {
    throw new Error(`An organization with slug "${input.slug}" already exists`);
  }

  const [organization] = await db
    .insert(authOrganizations)
    .values({
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      createdAt: new Date(),
      seatLimit: input.seatLimit,
    })
    .returning();

  return organization;
}

export async function getCompanyDetail(session: SessionScope, organizationId: string) {
  assertMaster(session);
  const db = getDb();

  const [organization] = await db
    .select()
    .from(authOrganizations)
    .where(eq(authOrganizations.id, organizationId))
    .limit(1);
  if (!organization) return null;

  const roster = await db
    .select({
      userId: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      onboardingState: authUsers.onboardingState,
      applicationRole: authUsers.role,
    })
    .from(authMembers)
    .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
    .where(eq(authMembers.organizationId, organizationId))
    .orderBy(asc(authUsers.name));

  const pendingInvitations = await db
    .select()
    .from(authInvitations)
    .where(
      and(eq(authInvitations.organizationId, organizationId), eq(authInvitations.status, "pending")),
    )
    .orderBy(desc(authInvitations.createdAt));

  return { organization, roster, pendingInvitations };
}

// Unguarded core, shared by both the master-only invite functions below and the
// company_admin's own-org invite in lib/team/roster.ts. Each caller is responsible for
// its own permission check before calling this -- in particular, only the master-only
// wrappers here may ever pass applicationRole "company_admin"; the company_admin-facing
// caller always hardcodes "learner" so a company admin can never invite another admin.
//
// `role` on the authInvitations row is repurposed here to carry this intended
// application-level role (learner | company_admin) rather than Better Auth's own
// org-membership role concept -- consistent with the rest of this module already
// bypassing the organization plugin's endpoints in favor of direct writes.
export async function inviteIntoOrganization(
  organizationId: string,
  inviterId: string,
  emails: string[],
  applicationRole: "learner" | "company_admin",
) {
  const db = getDb();

  const normalized = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) {
    return { invited: [] as string[], skipped: [] as { email: string; reason: string }[] };
  }

  const existingMembers = await db
    .select({ email: authUsers.email })
    .from(authMembers)
    .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
    .where(and(eq(authMembers.organizationId, organizationId), inArray(authUsers.email, normalized)));
  const memberEmails = new Set(existingMembers.map((row) => row.email.toLowerCase()));

  const existingInvitations = await db
    .select({ email: authInvitations.email })
    .from(authInvitations)
    .where(
      and(
        eq(authInvitations.organizationId, organizationId),
        eq(authInvitations.status, "pending"),
        inArray(authInvitations.email, normalized),
      ),
    );
  const pendingEmails = new Set(existingInvitations.map((row) => row.email.toLowerCase()));

  const invited: string[] = [];
  const skipped: { email: string; reason: string }[] = [];
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  for (const email of normalized) {
    if (memberEmails.has(email)) {
      skipped.push({ email, reason: "already a member" });
      continue;
    }
    if (pendingEmails.has(email)) {
      skipped.push({ email, reason: "invitation already pending" });
      continue;
    }

    await db.insert(authInvitations).values({
      id: randomUUID(),
      organizationId,
      email,
      role: applicationRole,
      status: "pending",
      expiresAt,
      inviterId,
      token: randomUUID(),
    });
    invited.push(email);
  }

  return { invited, skipped };
}

export async function inviteLearners(
  session: SessionScope,
  organizationId: string,
  inviterId: string,
  emails: string[],
) {
  assertMaster(session);
  return inviteIntoOrganization(organizationId, inviterId, emails, "learner");
}

export async function inviteCompanyOwner(
  session: SessionScope,
  organizationId: string,
  inviterId: string,
  email: string,
) {
  assertMaster(session);
  return inviteIntoOrganization(organizationId, inviterId, [email], "company_admin");
}

export async function setMemberApplicationRole(
  session: SessionScope,
  organizationId: string,
  userId: string,
  role: "learner" | "company_admin",
) {
  assertMaster(session);
  const db = getDb();

  const [member] = await db
    .select({ id: authMembers.id })
    .from(authMembers)
    .where(and(eq(authMembers.organizationId, organizationId), eq(authMembers.userId, userId)))
    .limit(1);
  if (!member) {
    throw new Error("This user is not a member of that organization");
  }

  await db.update(authUsers).set({ role }).where(eq(authUsers.id, userId));
}
