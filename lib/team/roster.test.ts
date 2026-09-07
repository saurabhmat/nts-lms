import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { authInvitations, authMembers, authOrganizations, authUsers } from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

import { getMyOrganizationRoster, inviteLearnersIntoMyOrganization } from "./roster";

const db = getDb();
const suffix = randomUUID().slice(0, 8);

const orgAId = `test-team-org-a-${suffix}`;
const orgBId = `test-team-org-b-${suffix}`;
const adminAId = `test-team-admin-a-${suffix}`;
const learnerAId = `test-team-learner-a-${suffix}`;
const learnerBId = `test-team-learner-b-${suffix}`;

async function cleanup() {
  await db.delete(authOrganizations).where(inArray(authOrganizations.id, [orgAId, orgBId]));
  await db.delete(authUsers).where(inArray(authUsers.id, [adminAId, learnerAId, learnerBId]));
}

describe("company admin roster (integration)", () => {
  afterAll(cleanup);

  it("never returns another organization's learners", async () => {
    await db.insert(authOrganizations).values([
      { id: orgAId, name: "Team Co A", slug: `team-co-a-${suffix}`, createdAt: new Date() },
      { id: orgBId, name: "Team Co B", slug: `team-co-b-${suffix}`, createdAt: new Date() },
    ]);
    await db.insert(authUsers).values([
      { id: adminAId, name: "Admin A", email: `team-admin-a-${suffix}@example.com`, role: "company_admin" },
      { id: learnerAId, name: "Learner A", email: `team-learner-a-${suffix}@example.com` },
      { id: learnerBId, name: "Learner B", email: `team-learner-b-${suffix}@example.com` },
    ]);
    await db.insert(authMembers).values([
      { id: `team-member-admin-a-${suffix}`, organizationId: orgAId, userId: adminAId, role: "admin", createdAt: new Date() },
      { id: `team-member-learner-a-${suffix}`, organizationId: orgAId, userId: learnerAId, role: "member", createdAt: new Date() },
      { id: `team-member-learner-b-${suffix}`, organizationId: orgBId, userId: learnerBId, role: "member", createdAt: new Date() },
    ]);

    const adminA: SessionScope = { userId: adminAId, role: "company_admin", organizationId: orgAId };
    const roster = await getMyOrganizationRoster(adminA);
    const ids = roster.map((member) => member.id);

    expect(ids).toContain(adminAId);
    expect(ids).toContain(learnerAId);
    expect(ids).not.toContain(learnerBId);
  });

  it("rejects a non-company_admin session", async () => {
    const master: SessionScope = { userId: "someone", role: "master", organizationId: null };
    await expect(getMyOrganizationRoster(master)).rejects.toThrow(
      "Only a company admin can view this roster",
    );
  });

  it("rejects a company_admin session with no organization", async () => {
    const orphan: SessionScope = { userId: "someone", role: "company_admin", organizationId: null };
    await expect(getMyOrganizationRoster(orphan)).rejects.toThrow(
      "This operation requires an organization",
    );
  });

  it("invites into its own organization only as a plain learner, never as company_admin", async () => {
    const adminA: SessionScope = { userId: adminAId, role: "company_admin", organizationId: orgAId };
    const email = `self-invited-${suffix}@example.com`;

    const result = await inviteLearnersIntoMyOrganization(adminA, adminAId, [email]);
    expect(result.invited).toEqual([email]);

    const [invitation] = await db
      .select({ role: authInvitations.role, organizationId: authInvitations.organizationId })
      .from(authInvitations)
      .where(eq(authInvitations.email, email));

    expect(invitation.role).toBe("learner");
    expect(invitation.organizationId).toBe(orgAId);
  });

  it("rejects a non-company_admin session trying to invite", async () => {
    const master: SessionScope = { userId: "someone", role: "master", organizationId: null };
    await expect(inviteLearnersIntoMyOrganization(master, "someone", ["x@example.com"])).rejects.toThrow(
      "Only a company admin can view this roster",
    );
  });
});
