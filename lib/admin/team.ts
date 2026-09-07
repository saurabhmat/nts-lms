import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { adminInvitations, authUsers } from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function assertMaster(session: SessionScope) {
  if (session.role !== "master") {
    throw new Error("Only the master role can manage team admins");
  }
}

export async function listMasters(session: SessionScope) {
  assertMaster(session);
  const db = getDb();
  return db
    .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email, createdAt: authUsers.createdAt })
    .from(authUsers)
    .where(eq(authUsers.role, "master"))
    .orderBy(authUsers.createdAt);
}

export async function listPendingAdminInvitations(session: SessionScope) {
  assertMaster(session);
  const db = getDb();
  return db
    .select()
    .from(adminInvitations)
    .where(eq(adminInvitations.status, "pending"))
    .orderBy(desc(adminInvitations.createdAt));
}

export async function inviteAdmins(session: SessionScope, inviterId: string, emails: string[]) {
  assertMaster(session);
  const db = getDb();

  const normalized = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) {
    return { invited: [] as string[], skipped: [] as { email: string; reason: string }[] };
  }

  const existingMasters = await db
    .select({ email: authUsers.email })
    .from(authUsers)
    .where(and(eq(authUsers.role, "master"), inArray(authUsers.email, normalized)));
  const masterEmails = new Set(existingMasters.map((row) => row.email.toLowerCase()));

  const existingInvitations = await db
    .select({ email: adminInvitations.email })
    .from(adminInvitations)
    .where(and(eq(adminInvitations.status, "pending"), inArray(adminInvitations.email, normalized)));
  const pendingEmails = new Set(existingInvitations.map((row) => row.email.toLowerCase()));

  const invited: string[] = [];
  const skipped: { email: string; reason: string }[] = [];
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  for (const email of normalized) {
    if (masterEmails.has(email)) {
      skipped.push({ email, reason: "already an admin" });
      continue;
    }
    if (pendingEmails.has(email)) {
      skipped.push({ email, reason: "invitation already pending" });
      continue;
    }

    await db.insert(adminInvitations).values({
      email,
      token: randomUUID(),
      invitedBy: inviterId,
      status: "pending",
      expiresAt,
    });
    invited.push(email);
  }

  return { invited, skipped };
}

export async function getPendingAdminInvitationByToken(token: string) {
  const db = getDb();
  const [invitation] = await db
    .select()
    .from(adminInvitations)
    .where(eq(adminInvitations.token, token))
    .limit(1);

  if (!invitation) return null;
  if (invitation.status !== "pending") return null;
  if (invitation.expiresAt < new Date()) return null;
  return invitation;
}

export async function finalizeAdminInvitationAcceptance(token: string, email: string) {
  const invitation = await getPendingAdminInvitationByToken(token);
  if (!invitation || invitation.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error("This invitation is invalid or has expired.");
  }

  const db = getDb();
  await db.update(authUsers).set({ role: "master" }).where(eq(authUsers.email, email));
  await db
    .update(adminInvitations)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(adminInvitations.id, invitation.id));
}
