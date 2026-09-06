import {
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  pgSchema,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["master", "company_admin", "learner"]);
export const onboardingState = pgEnum("onboarding_state", [
  "pending",
  "psychometric_done",
  "questionnaire_done",
  "complete",
]);
export const language = pgEnum("language", ["en", "hi"]);
export const organizationStatus = pgEnum("organization_status", ["active", "paused"]);
export const questionSetType = pgEnum("question_set_type", [
  "psychometric",
  "setup",
  "chapter_test",
]);
export const attemptStatus = pgEnum("attempt_status", ["in_progress", "submitted"]);
export const progressStatus = pgEnum("progress_status", [
  "locked",
  "available",
  "in_progress",
  "complete",
]);

export const authSchema = pgSchema("auth");

export const authOrganizations = authSchema.table("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull(),
  metadata: text("metadata"),
  brandColor: text("brand_color"),
  seatLimit: integer("seat_limit"),
  status: organizationStatus("status").default("active").notNull(),
}, (table) => [uniqueIndex("auth_organizations_slug_uidx").on(table.slug)]);

export const authUsers = authSchema.table("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  role: userRole("role").default("learner").notNull(),
  onboardingState: onboardingState("onboarding_state").default("pending").notNull(),
  preferredLanguage: language("preferred_language").default("en").notNull(),
});

export const authSessions = authSchema.table(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)],
);

export const authAccounts = authSchema.table(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("auth_accounts_user_id_idx").on(table.userId)],
);

export const authVerifications = authSchema.table(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

export const authMembers = authSchema.table(
  "members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => authOrganizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("auth_members_organization_id_idx").on(table.organizationId),
    index("auth_members_user_id_idx").on(table.userId),
    uniqueIndex("auth_members_user_id_uidx").on(table.userId),
  ],
);

export const authInvitations = authSchema.table(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => authOrganizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    token: text("token").unique(),
    acceptedAt: timestamp("accepted_at"),
  },
  (table) => [
    index("auth_invitations_organization_id_idx").on(table.organizationId),
    index("auth_invitations_email_idx").on(table.email),
  ],
);

export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  isPublished: boolean("is_published").notNull().default(false),
});

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    titleEn: text("title_en").notNull(),
    titleHi: text("title_hi").notNull(),
    summaryEn: text("summary_en").notNull(),
    notesFileKey: text("notes_file_key"),
    deliverableEn: text("deliverable_en").notNull(),
    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.courseId, table.order)],
);

export const questionSets = pgTable("question_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: questionSetType("type").notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
});

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setId: uuid("set_id").notNull().references(() => questionSets.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    promptEn: text("prompt_en").notNull(),
    promptHi: text("prompt_hi").notNull(),
    options: jsonb("options").notNull().$type<
      Array<{ key: string; en: string; hi: string }>
    >(),
    correctOption: text("correct_option"),
    trait: text("trait"),
    optionScores: jsonb("option_scores").$type<Record<string, number>>(),
  },
  (table) => [unique().on(table.setId, table.order)],
);

export const attempts = pgTable("attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  setId: uuid("set_id").notNull().references(() => questionSets.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  currentQuestionIndex: integer("current_question_index").notNull().default(0),
  status: attemptStatus("status").notNull().default("in_progress"),
  score: real("score"),
  maxScore: real("max_score"),
  passed: boolean("passed"),
  attemptNo: integer("attempt_no").notNull(),
});

export const responses = pgTable(
  "responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    selectedOption: text("selected_option").notNull(),
    isCorrect: boolean("is_correct"),
  },
  (table) => [unique().on(table.attemptId, table.questionId)],
);

export const analysisBands = pgTable("analysis_bands", {
  id: uuid("id").defaultRandom().primaryKey(),
  minPct: real("min_pct").notNull(),
  maxPct: real("max_pct").notNull(),
  label: text("label").notNull(),
  bodyEn: text("body_en").notNull(),
  bodyHi: text("body_hi").notNull(),
});

export const analyses = pgTable("analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  psychometricScore: real("psychometric_score").notNull(),
  bandId: uuid("band_id").notNull().references(() => analysisBands.id),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const progress = pgTable(
  "progress",
  {
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
    status: progressStatus("status").notNull().default("locked"),
    testScore: real("test_score"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.chapterId] })],
);

export const setupAnswers = pgTable(
  "setup_answers",
  {
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    answer: text("answer").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.questionId] })],
);

export const courseSettings = pgTable("course_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  sequencingRule: text("sequencing_rule").notNull().default("sequential"),
  passMarkPct: real("pass_mark_pct").notNull().default(70),
  retakeLimit: integer("retake_limit").notNull().default(2),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof authOrganizations.$inferSelect;
export type User = typeof authUsers.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Question = typeof questions.$inferSelect;
