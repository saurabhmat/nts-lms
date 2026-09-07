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
    // TODO: swap for a real Brevo send once BREVO_API_KEY is configured (see docs/infrastructure.md).
    // Until then the reset link is logged so the flow is fully testable locally.
    //
    // Build our own URL from `token` rather than using the provided `url` -- the default
    // points at Better Auth's own /api/auth/reset-password/:token redirect-hop endpoint,
    // not directly at our app/reset-password/[token] page.
    sendResetPassword: async ({ user, token }) => {
      const url = `${process.env.BETTER_AUTH_URL}/reset-password/${token}`;
      console.log(`[auth] Password reset link for ${user.email}: ${url}`);
    },
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
