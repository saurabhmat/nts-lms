import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import {
  analyses,
  analysisBands,
  attempts,
  authMembers,
  authOrganizations,
  authUsers,
  chapters,
  courses,
  progress,
  questionSets,
} from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

import {
  assertCanViewLearner,
  getCompanyOverviews,
  getIndividualLearners,
  getLearnerProgress,
  getLearnerRecord,
  getPlatformSummary,
  listChapterColumns,
} from "./reporting";

const db = getDb();
const suffix = randomUUID().slice(0, 8);

const orgAId = `rep-org-a-${suffix}`;
const orgBId = `rep-org-b-${suffix}`;
const adminAId = `rep-admin-a-${suffix}`;
const learnerAId = `rep-learner-a-${suffix}`;
const learnerA2Id = `rep-learner-a2-${suffix}`;
const learnerBId = `rep-learner-b-${suffix}`;
const soloId = `rep-solo-${suffix}`;
const COURSE_SLUG = `rep-course-${suffix}`;

const master: SessionScope = { userId: `rep-master-${suffix}`, role: "master", organizationId: null };
const adminA: SessionScope = { userId: adminAId, role: "company_admin", organizationId: orgAId };
const learnerA: SessionScope = { userId: learnerAId, role: "learner", organizationId: orgAId };
const learnerB: SessionScope = { userId: learnerBId, role: "learner", organizationId: orgBId };

const chapterIds: string[] = [];

async function cleanup() {
  const [course] = await db.select().from(courses).where(eq(courses.slug, COURSE_SLUG)).limit(1);
  if (course) {
    await db.delete(chapters).where(eq(chapters.courseId, course.id));
    await db.delete(courses).where(eq(courses.id, course.id));
  }
  await db.delete(authOrganizations).where(inArray(authOrganizations.id, [orgAId, orgBId]));
  await db
    .delete(authUsers)
    .where(inArray(authUsers.id, [adminAId, learnerAId, learnerA2Id, learnerBId, soloId]));
  await db.delete(analysisBands);
}

beforeAll(async () => {
  await cleanup();

  await db.insert(authOrganizations).values([
    { id: orgAId, name: "Rep Co A", slug: `rep-co-a-${suffix}`, createdAt: new Date(), seatLimit: 20 },
    { id: orgBId, name: "Rep Co B", slug: `rep-co-b-${suffix}`, createdAt: new Date() },
  ]);

  await db.insert(authUsers).values([
    { id: adminAId, name: "Admin A", email: `rep-admin-a-${suffix}@example.com`, role: "company_admin" },
    { id: learnerAId, name: "Aaa Learner", email: `rep-learner-a-${suffix}@example.com`, onboardingState: "complete" },
    { id: learnerA2Id, name: "Bbb Learner", email: `rep-learner-a2-${suffix}@example.com` },
    { id: learnerBId, name: "Ccc Learner", email: `rep-learner-b-${suffix}@example.com` },
    { id: soloId, name: "Ddd Solo", email: `rep-solo-${suffix}@example.com` },
  ]);

  await db.insert(authMembers).values([
    { id: `rep-m-admin-a-${suffix}`, organizationId: orgAId, userId: adminAId, role: "admin", createdAt: new Date() },
    { id: `rep-m-learner-a-${suffix}`, organizationId: orgAId, userId: learnerAId, role: "member", createdAt: new Date() },
    { id: `rep-m-learner-a2-${suffix}`, organizationId: orgAId, userId: learnerA2Id, role: "member", createdAt: new Date() },
    { id: `rep-m-learner-b-${suffix}`, organizationId: orgBId, userId: learnerBId, role: "member", createdAt: new Date() },
  ]);

  const [course] = await db
    .insert(courses)
    .values({ title: "Rep Course", slug: COURSE_SLUG, isPublished: true })
    .returning({ id: courses.id });

  // Two published chapters, plus one unpublished that must never appear in a report.
  for (let i = 1; i <= 3; i++) {
    const [chapter] = await db
      .insert(chapters)
      .values({
        courseId: course.id,
        order: i,
        titleEn: `Rep Chapter ${i}`,
        titleHi: `अध्याय ${i}`,
        summaryEn: "s",
        deliverableEn: "d",
        notesFileKey: `chapters/rep${i}/notes/x.pdf`,
        isPublished: i <= 2,
      })
      .returning({ id: chapters.id });
    chapterIds.push(chapter.id);
  }

  // Learner A: chapter 1 complete with a score, chapter 2 in progress.
  await db.insert(progress).values([
    { userId: learnerAId, chapterId: chapterIds[0], status: "complete", testScore: 8, completedAt: new Date() },
    { userId: learnerAId, chapterId: chapterIds[1], status: "in_progress", testScore: 4 },
    { userId: learnerBId, chapterId: chapterIds[0], status: "complete", testScore: 10, completedAt: new Date() },
  ]);

  const [band] = await db
    .insert(analysisBands)
    .values({ minPct: 0, maxPct: 100, label: "Proficient", bodyEn: "en", bodyHi: "hi" })
    .returning({ id: analysisBands.id });
  await db.insert(analyses).values({ userId: learnerAId, psychometricScore: 72, bandId: band.id });
});

afterAll(cleanup);

describe("chapter columns", () => {
  it("reports only published chapters, in order", async () => {
    const columns = await listChapterColumns();
    const mine = columns.filter((column) => chapterIds.includes(column.id));
    expect(mine).toHaveLength(2);
    expect(mine.map((column) => column.order)).toEqual([1, 2]);
  });
});

describe("organisation isolation", () => {
  // The highest-severity bug in this system would be one company seeing another's scores.
  it("never lets a company admin see another company's learners", async () => {
    const rows = await getLearnerProgress(adminA);
    const ids = rows.map((row) => row.id);

    expect(ids).toContain(learnerAId);
    expect(ids).toContain(learnerA2Id);
    expect(ids).not.toContain(learnerBId);
    expect(ids).not.toContain(soloId);
  });

  it("rejects a company admin asking for another organisation by id", async () => {
    await expect(getLearnerProgress(adminA, orgBId)).rejects.toThrow(/scope does not match/i);
  });

  it("returns only the learner themselves for a learner session", async () => {
    const rows = await getLearnerProgress(learnerA);
    expect(rows.map((row) => row.id)).toEqual([learnerAId]);
  });

  it("lets the master scope to one company", async () => {
    const rows = await getLearnerProgress(master, orgAId);
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(learnerAId);
    expect(ids).not.toContain(learnerBId);
  });
});

describe("progress roll-up", () => {
  it("computes completion and average score per learner", async () => {
    const rows = await getLearnerProgress(master, orgAId);
    const rowA = rows.find((row) => row.id === learnerAId)!;

    expect(rowA.chaptersComplete).toBe(1);
    expect(rowA.completionPct).toBe(50); // 1 of 2 published chapters
    expect(rowA.averageScore).toBe(6); // (8 + 4) / 2
    expect(rowA.psychometricPct).toBe(72);
    expect(rowA.bandLabel).toBe("Proficient");

    const rowA2 = rows.find((row) => row.id === learnerA2Id)!;
    expect(rowA2.chaptersComplete).toBe(0);
    expect(rowA2.averageScore).toBeNull();
    expect(rowA2.psychometricPct).toBeNull();
  });

  it("does not count an unpublished chapter towards completion", async () => {
    const rows = await getLearnerProgress(master, orgAId);
    const rowA = rows.find((row) => row.id === learnerAId)!;
    expect(Object.keys(rowA.chapters)).not.toContain(chapterIds[2]);
  });
});

describe("company overviews", () => {
  it("counts learners, managers and onboarded learners per company", async () => {
    const companies = await getCompanyOverviews(master);
    const companyA = companies.find((company) => company.id === orgAId)!;

    expect(companyA.name).toBe("Rep Co A");
    expect(companyA.learnerCount).toBe(2);
    expect(companyA.adminCount).toBe(1); // the company admin is not counted as a learner
    expect(companyA.onboardedCount).toBe(1);
    expect(companyA.seatLimit).toBe(20);
    expect(companyA.completionPct).toBe(25); // (50 + 0) / 2
  });

  it("refuses a non-master caller", async () => {
    await expect(getCompanyOverviews(adminA)).rejects.toThrow(/Only the master/i);
    await expect(getIndividualLearners(adminA)).rejects.toThrow(/Only the master/i);
    await expect(getPlatformSummary(learnerA)).rejects.toThrow(/Only the master/i);
  });
});

describe("individual learners", () => {
  it("returns learners with no company, and excludes company members", async () => {
    const rows = await getIndividualLearners(master);
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(soloId);
    expect(ids).not.toContain(learnerAId);
    expect(ids).not.toContain(learnerBId);
  });
});

describe("learner record access", () => {
  it("lets the master open anyone", async () => {
    await expect(assertCanViewLearner(master, learnerBId)).resolves.toBeUndefined();
    const record = await getLearnerRecord(master, learnerAId);
    expect(record?.learner.name).toBe("Aaa Learner");
  });

  it("lets a company admin open their own learner but not another company's", async () => {
    await expect(assertCanViewLearner(adminA, learnerAId)).resolves.toBeUndefined();
    await expect(assertCanViewLearner(adminA, learnerBId)).rejects.toThrow(/do not have access/i);
    await expect(getLearnerRecord(adminA, learnerBId)).rejects.toThrow(/do not have access/i);
  });

  it("lets a learner open only themselves", async () => {
    await expect(assertCanViewLearner(learnerA, learnerAId)).resolves.toBeUndefined();
    await expect(assertCanViewLearner(learnerA, learnerA2Id)).rejects.toThrow(/do not have access/i);
    await expect(getLearnerRecord(learnerB, learnerAId)).rejects.toThrow(/do not have access/i);
  });

  it("includes submitted attempts in the record", async () => {
    const [set] = await db
      .insert(questionSets)
      .values({ type: "chapter_test", chapterId: chapterIds[0], title: "Rep test" })
      .returning({ id: questionSets.id });
    await db.insert(attempts).values({
      userId: learnerAId,
      setId: set.id,
      attemptNo: 1,
      status: "submitted",
      submittedAt: new Date(),
      score: 8,
      maxScore: 10,
      passed: true,
    });

    const record = await getLearnerRecord(master, learnerAId);
    expect(record!.attempts).toHaveLength(1);
    expect(record!.attempts[0].score).toBe(8);
    expect(record!.attempts[0].passed).toBe(true);
    expect(record!.attempts[0].chapterTitle).toBe("Rep Chapter 1");
  });
});
