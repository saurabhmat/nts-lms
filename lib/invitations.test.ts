import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { authInvitations, authMembers, authOrganizations, authUsers } from "@/db/schema";

import { finalizeInvitationAcceptance, getPendingInvitationByToken } from "./invitations";

const db = getDb();
const suffix = randomUUID().slice(0, 8);

const orgId = `test-invite-org-${suffix}`;
const inviterId = `test-invite-inviter-${suffix}`;
const learnerUserId = `test-invite-learner-${suffix}`;
const ownerUserId = `test-invite-owner-${suffix}`;

async function cleanup() {
  await db.delete(authOrganizations).where(inArray(authOrganizations.id, [orgId]));
  await db.delete(authUsers).where(inArray(authUsers.id, [inviterId, learnerUserId, ownerUserId]));
}

describe("invitation acceptance (integration)", () => {
  afterAll(cleanup);

  it("promotes the invitee to company_admin when the invitation intended that role", async () => {
    await db.insert(authUsers).values([
      { id: inviterId, name: "Inviter", email: `inviter-${suffix}@example.com`, role: "master" },
      { id: ownerUserId, name: "Owner", email: `owner-${suffix}@example.com` },
    ]);
    await db.insert(authOrganizations).values({
      id: orgId,
      name: "Invite Org",
      slug: `invite-org-${suffix}`,
      createdAt: new Date(),
    });

    const token = randomUUID();
    await db.insert(authInvitations).values({
      id: randomUUID(),
      organizationId: orgId,
      email: `owner-${suffix}@example.com`,
      role: "company_admin",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      inviterId,
      token,
    });

    await finalizeInvitationAcceptance(token, `owner-${suffix}@example.com`, ownerUserId);

    const [user] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, ownerUserId));
    expect(user.role).toBe("company_admin");

    const found = await getPendingInvitationByToken(token);
    expect(found).toBeNull();

    const [member] = await db.select().from(authMembers).where(eq(authMembers.userId, ownerUserId));
    expect(member.organizationId).toBe(orgId);
  });

  it("leaves the invitee as a plain learner when the invitation was for a learner", async () => {
    await db.insert(authUsers).values({ id: learnerUserId, name: "Learner", email: `learner-${suffix}@example.com` });

    const token = randomUUID();
    await db.insert(authInvitations).values({
      id: randomUUID(),
      organizationId: orgId,
      email: `learner-${suffix}@example.com`,
      role: "learner",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      inviterId,
      token,
    });

    await finalizeInvitationAcceptance(token, `learner-${suffix}@example.com`, learnerUserId);

    const [user] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, learnerUserId));
    expect(user.role).toBe("learner");
  });

  it("rejects an unknown token", async () => {
    await expect(
      finalizeInvitationAcceptance("nonexistent-token", "x@example.com", "someone"),
    ).rejects.toThrow("This invitation is invalid or has expired.");
  });
});
