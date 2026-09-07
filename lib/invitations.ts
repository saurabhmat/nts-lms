import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { authInvitations, authMembers, authOrganizations, authUsers } from "@/db/schema";

export async function getPendingInvitationByToken(token: string) {
  const db = getDb();
  const [invitation] = await db
    .select({
      id: authInvitations.id,
      email: authInvitations.email,
      organizationId: authInvitations.organizationId,
      status: authInvitations.status,
      expiresAt: authInvitations.expiresAt,
      // The intended application role (learner | company_admin) -- see the note on
      // inviteIntoOrganization in lib/admin/companies.ts for why this reuses the column.
      applicationRole: authInvitations.role,
      organizationName: authOrganizations.name,
    })
    .from(authInvitations)
    .innerJoin(authOrganizations, eq(authOrganizations.id, authInvitations.organizationId))
    .where(eq(authInvitations.token, token))
    .limit(1);

  if (!invitation) return null;
  if (invitation.status !== "pending") return null;
  if (invitation.expiresAt < new Date()) return null;
  return invitation;
}

// Writes the auth.members row directly rather than calling auth.api.acceptInvitation.
// That endpoint requires an already-authenticated session matching the invited email,
// but the session signUpEmail just created isn't visible yet via headers() within the
// same server action -- the new session cookie is only attached to the outgoing
// response, not the incoming request headers() still reflects. Same class of bug as
// the earlier login-redirect fix; direct writes sidestep it entirely.
export async function finalizeInvitationAcceptance(token: string, email: string, userId: string) {
  const invitation = await getPendingInvitationByToken(token);
  if (!invitation || invitation.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error("This invitation is invalid or has expired.");
  }

  const db = getDb();
  await db.insert(authMembers).values({
    id: randomUUID(),
    organizationId: invitation.organizationId,
    userId,
    role: "member",
    createdAt: new Date(),
  });
  if (invitation.applicationRole === "company_admin") {
    await db.update(authUsers).set({ role: "company_admin" }).where(eq(authUsers.id, userId));
  }
  await db
    .update(authInvitations)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(authInvitations.id, invitation.id));
}
