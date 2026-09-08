import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { courseSettings } from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

export type CourseSettings = {
  id: string;
  sequencingRule: string;
  passMarkPct: number;
  retakeLimit: number;
};

// The settings row is created on first read rather than by a migration, so a fresh
// database (local, preview or production) always has working defaults without a seed step.
// The column defaults in db/schema.ts are the single source of those values.
export async function getCourseSettings(): Promise<CourseSettings> {
  const db = getDb();

  const [existing] = await db.select().from(courseSettings).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(courseSettings).values({}).returning();
  return created;
}

export async function updateCourseSettings(
  session: SessionScope,
  input: { sequencingRule?: string; passMarkPct?: number; retakeLimit?: number },
): Promise<CourseSettings> {
  if (session.role !== "master") {
    throw new Error("Only the master role can change course settings");
  }
  if (input.passMarkPct !== undefined && (input.passMarkPct < 0 || input.passMarkPct > 100)) {
    throw new Error("The pass mark must be between 0 and 100");
  }
  if (input.retakeLimit !== undefined && input.retakeLimit < 0) {
    throw new Error("The retake limit cannot be negative");
  }
  if (input.sequencingRule !== undefined && !["sequential", "open"].includes(input.sequencingRule)) {
    throw new Error('The sequencing rule must be "sequential" or "open"');
  }

  const current = await getCourseSettings();
  const db = getDb();

  const [updated] = await db
    .update(courseSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(courseSettings.id, current.id))
    .returning();

  return updated;
}
