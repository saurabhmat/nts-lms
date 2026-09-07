import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { authMembers, authOrganizations, authUsers } from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

import { getCompanyDetail, inviteLearners, listCompanies } from "./companies";

const db = getDb();
const suffix = randomUUID().slice(0, 8);

const masterUserId = `test-master-${suffix}`;
const orgAId = `test-org-a-${suffix}`;
const orgBId = `test-org-b-${suffix}`;
const userAId = `test-user-a-${suffix}`;
const userBId = `test-user-b-${suffix}`;

const master: SessionScope = { userId: masterUserId, role: "master", organizationId: null };

async function seed() {
  await db.insert(authUsers).values([
    { id: masterUserId, name: "Test Master", email: `master-${suffix}@example.com` },
    { id: userAId, name: "Learner A", email: `learner-a-${suffix}@example.com` },
    { id: userBId, name: "Learner B", email: `learner-b-${suffix}@example.com` },
  ]);
  await db.insert(authOrganizations).values([
    { id: orgAId, name: "Company A", slug: `company-a-${suffix}`, createdAt: new Date() },
    { id: orgBId, name: "Company B", slug: `company-b-${suffix}`, createdAt: new Date() },
  ]);
  await db.insert(authMembers).values([
    {
      id: `member-a-${suffix}`,
      organizationId: orgAId,
      userId: userAId,
      role: "member",
      createdAt: new Date(),
    },
    {
      id: `member-b-${suffix}`,
      organizationId: orgBId,
      userId: userBId,
      role: "member",
      createdAt: new Date(),
    },
  ]);
}

async function cleanup() {
  await db.delete(authOrganizations).where(inArray(authOrganizations.id, [orgAId, orgBId]));
  await db.delete(authUsers).where(inArray(authUsers.id, [masterUserId, userAId, userBId]));
}

describe("company admin queries (integration)", () => {
  afterAll(cleanup);

  it("lists both seeded companies for master", async () => {
    await seed();

    const companies = await listCompanies(master);
    const ids = companies.map((company) => company.id);

    expect(ids).toContain(orgAId);
    expect(ids).toContain(orgBId);
  });

  it("scopes a company's roster to its own members only", async () => {
    const detailA = await getCompanyDetail(master, orgAId);
    const detailB = await getCompanyDetail(master, orgBId);

    expect(detailA?.roster.map((member) => member.userId)).toEqual([userAId]);
    expect(detailB?.roster.map((member) => member.userId)).toEqual([userBId]);
    expect(detailA?.roster.map((member) => member.userId)).not.toContain(userBId);
  });

  it("does not invite an email that is already a member of the organization", async () => {
    const result = await inviteLearners(master, orgAId, masterUserId, [
      `learner-a-${suffix}@example.com`,
    ]);

    expect(result.invited).toEqual([]);
    expect(result.skipped[0]).toMatchObject({ reason: "already a member" });
  });

  it("does not invite the same email twice while a pending invitation exists", async () => {
    const email = `new-learner-${suffix}@example.com`;

    const first = await inviteLearners(master, orgAId, masterUserId, [email]);
    const second = await inviteLearners(master, orgAId, masterUserId, [email]);

    expect(first.invited).toEqual([email]);
    expect(second.invited).toEqual([]);
    expect(second.skipped[0]).toMatchObject({ reason: "invitation already pending" });
  });

  it("never lets one company's invitation collide with another company's roster", async () => {
    const email = `learner-a-${suffix}@example.com`;

    const result = await inviteLearners(master, orgBId, masterUserId, [email]);

    expect(result.invited).toEqual([email]);
  });
});
