import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
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

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color"),
  seatLimit: integer("seat_limit"),
  status: organizationStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull().default("learner"),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  onboardingState: onboardingState("onboarding_state").notNull().default("pending"),
  preferredLanguage: language("preferred_language").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  email: text("email").notNull(),
  role: userRole("role").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

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
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  setId: uuid("set_id").notNull().references(() => questionSets.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
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
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  psychometricScore: real("psychometric_score").notNull(),
  bandId: uuid("band_id").notNull().references(() => analysisBands.id),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const progress = pgTable(
  "progress",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Question = typeof questions.$inferSelect;
