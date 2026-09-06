import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

import { getDb } from "@/db";
import * as schema from "@/db/schema";

const betterAuthSchema = {
  users: schema.authUsers,
  sessions: schema.authSessions,
  accounts: schema.authAccounts,
  verifications: schema.authVerifications,
  organizations: schema.authOrganizations,
  members: schema.authMembers,
  invitations: schema.authInvitations,
};

export const auth = betterAuth({
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "learner" },
      onboardingState: { type: "string", required: true, defaultValue: "pending" },
      preferredLanguage: { type: "string", required: true, defaultValue: "en" },
    },
  },
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: betterAuthSchema,
    usePlural: true,
    schemaName: "auth",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      schema: {
        organization: {
          additionalFields: {
            brandColor: { type: "string", required: false },
            seatLimit: { type: "number", required: false },
            status: { type: "string", required: true, defaultValue: "active" },
          },
        },
        invitation: {
          additionalFields: {
            token: { type: "string", required: false },
            acceptedAt: { type: "date", required: false },
          },
        },
      },
    }),
    nextCookies(),
  ],
});
