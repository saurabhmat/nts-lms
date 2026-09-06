import { describe, expect, it } from "vitest";

import { organizationUserWhere, requireOrganizationId } from "./org-scope";

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
