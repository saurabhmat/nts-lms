import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { authUsers } from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

import {
  finalizeAdminInvitationAcceptance,
  getPendingAdminInvitationByToken,
  inviteAdmins,
  listMasters,
  listPendingAdminInvitations,
} from "./team";

const db = getDb();
const suffix = randomUUID().slice(0, 8);

const masterUserId = `test-team-master-${suffix}`;
const master: SessionScope = { userId: masterUserId, role: "master", organizationId: null };

async function cleanup() {
  await db.delete(authUsers).where(
    inArray(authUsers.id, [
      masterUserId,
      `existing-master-${suffix}`,
      `accepted-master-${suffix}`,
    ]),
  );
}

describe("team admin invitations (integration)", () => {
  afterAll(cleanup);

  it("does not invite an email that is already a master", async () => {
    await db.insert(authUsers).values([
      { id: masterUserId, name: "Test Master", email: `master-${suffix}@example.com` },
      {
        id: `existing-master-${suffix}`,
        name: "Existing Master",
        email: `existing-${suffix}@example.com`,
        role: "master",
      },
    ]);

    const result = await inviteAdmins(master, masterUserId, [`existing-${suffix}@example.com`]);

    expect(result.invited).toEqual([]);
    expect(result.skipped[0]).toMatchObject({ reason: "already an admin" });
  });

  it("appears in listMasters after being seeded as master", async () => {
    const masters = await listMasters(master);
    expect(masters.map((m) => m.id)).toContain(`existing-master-${suffix}`);
  });

  it("does not invite the same email twice while a pending invitation exists", async () => {
    const email = `new-admin-${suffix}@example.com`;

    const first = await inviteAdmins(master, masterUserId, [email]);
    const second = await inviteAdmins(master, masterUserId, [email]);

    expect(first.invited).toEqual([email]);
    expect(second.invited).toEqual([]);
    expect(second.skipped[0]).toMatchObject({ reason: "invitation already pending" });

    const pending = await listPendingAdminInvitations(master);
    expect(pending.filter((invite) => invite.email === email)).toHaveLength(1);
  });

  it("rejects a non-master session", async () => {
    const learner: SessionScope = { userId: "someone", role: "learner", organizationId: null };
    await expect(inviteAdmins(learner, "someone", ["x@example.com"])).rejects.toThrow(
      "Only the master role can manage team admins",
    );
  });

  it("promotes the invitee to master and marks the invitation accepted", async () => {
    const email = `accept-me-${suffix}@example.com`;
    await db.insert(authUsers).values({
      id: `accepted-master-${suffix}`,
      name: "Accepted Master",
      email,
    });

    const [{ invited }] = [await inviteAdmins(master, masterUserId, [email])];
    expect(invited).toEqual([email]);

    const pending = await listPendingAdminInvitations(master);
    const invitation = pending.find((invite) => invite.email === email);
    expect(invitation).toBeDefined();

    await finalizeAdminInvitationAcceptance(invitation!.token, email);

    const found = await getPendingAdminInvitationByToken(invitation!.token);
    expect(found).toBeNull();

    const masters = await listMasters(master);
    expect(masters.map((m) => m.id)).toContain(`accepted-master-${suffix}`);
  });
});
