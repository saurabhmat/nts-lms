import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { authMembers, authUsers } from "@/db/schema";
import {
  organizationScopeWhere,
  organizationUserWhere,
  requireOrganizationId,
} from "./org-scope";

describe("organization scope", () => {
  const companyA = {
    userId: "learner-a",
    role: "company_admin" as const,
    organizationId: "company-a",
  };

  it("keeps a company admin inside its own organization", () => {
    expect(organizationUserWhere(companyA)).toBeDefined();
    expect(() => organizationUserWhere(companyA, "company-b")).toThrow(
      "Organization scope does not match the current session",
    );
  });

  it("cannot read another organization's rows", () => {
    const where = organizationUserWhere(companyA);
    const query = new PgDialect().sqlToQuery(sql`select * from ${authUsers} where ${where}`);

    expect(query.params).toContain("company-a");
    expect(query.params).not.toContain("company-b");
  });

  it("allows an individual learner without a membership row", () => {
    const where = organizationUserWhere({
      userId: "individual",
      role: "learner",
      organizationId: null,
    });
    const query = new PgDialect().sqlToQuery(sql`select * from ${authUsers} where ${where}`);

    expect(query.params).toEqual(["individual"]);
    expect(query.sql).not.toContain('"auth"."members"');
  });

  it("cannot read organization data without a membership row", () => {
    expect(() =>
      organizationScopeWhere(
        { organizationId: authMembers.organizationId },
        { userId: "individual", role: "learner", organizationId: null },
      ),
    ).toThrow("An organization is required for this role");
  });

  it("cannot read another individual learner's row", () => {
    const where = organizationUserWhere({
      userId: "individual-a",
      role: "learner",
      organizationId: null,
    });
    const query = new PgDialect().sqlToQuery(sql`select * from ${authUsers} where ${where}`);

    expect(query.params).toEqual(["individual-a"]);
    expect(query.params).not.toContain("individual-b");
  });

  it("limits a learner to their own user row", () => {
    const where = organizationUserWhere({
      userId: "learner-a",
      role: "learner",
      organizationId: "company-a",
    });

    expect(where).toBeDefined();
  });

  it("allows a master to select an explicit organization or all organizations", () => {
    const master = {
      userId: "master",
      role: "master" as const,
      organizationId: null,
    };

    expect(organizationUserWhere(master)).toBeUndefined();
    expect(organizationUserWhere(master, "company-b")).toBeDefined();
  });

  it("rejects organization-required operations for individual learners", () => {
    expect(() =>
      requireOrganizationId({
        userId: "individual",
        role: "learner",
        organizationId: null,
      }),
    ).toThrow("This operation requires an organization");
  });
});
