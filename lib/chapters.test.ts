import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "@/db";
import { chapters, courses } from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

import {
  getChapterForAdmin,
  getChapterNotesUrl,
  listChaptersForAdmin,
  setChapterPublished,
  updateChapterText,
  uploadChapterNotes,
} from "./chapters";

const db = getDb();
const master: SessionScope = { userId: "chapters-test-master", role: "master", organizationId: null };
const companyAdmin: SessionScope = { userId: "chapters-test-admin", role: "company_admin", organizationId: "org-a" };
const learner: SessionScope = { userId: "chapters-test-learner", role: "learner", organizationId: null };

const COURSE_SLUG = "chapters-test-course";
let courseId: string;
let chapterId: string;

async function cleanup() {
  const [course] = await db.select().from(courses).where(eq(courses.slug, COURSE_SLUG)).limit(1);
  if (course) {
    await db.delete(chapters).where(eq(chapters.courseId, course.id));
    await db.delete(courses).where(eq(courses.id, course.id));
  }
}

beforeAll(async () => {
  await cleanup();
  const [course] = await db
    .insert(courses)
    .values({ title: "Chapters Test", slug: COURSE_SLUG })
    .returning({ id: courses.id });
  courseId = course.id;

  const [chapter] = await db
    .insert(chapters)
    .values({
      courseId,
      order: 1,
      titleEn: "Original",
      titleHi: "मूल",
      summaryEn: "Summary",
      deliverableEn: "Deliverable",
    })
    .returning({ id: chapters.id });
  chapterId = chapter.id;
});

afterAll(cleanup);

describe("chapter admin access control", () => {
  it("refuses a company admin", async () => {
    await expect(listChaptersForAdmin(companyAdmin)).rejects.toThrow(/Only the master role/);
    await expect(getChapterForAdmin(companyAdmin, chapterId)).rejects.toThrow(/Only the master role/);
  });

  it("refuses a learner", async () => {
    await expect(getChapterNotesUrl(learner, chapterId)).rejects.toThrow(/Only the master role/);
    await expect(
      updateChapterText(learner, chapterId, { titleEn: "x", titleHi: "y", summaryEn: "", deliverableEn: "" }),
    ).rejects.toThrow(/Only the master role/);
  });
});

describe("chapter editing", () => {
  it("updates chapter text", async () => {
    await updateChapterText(master, chapterId, {
      titleEn: "  Updated  ",
      titleHi: "अद्यतन",
      summaryEn: "New summary",
      deliverableEn: "New deliverable",
    });

    const result = await getChapterForAdmin(master, chapterId);
    expect(result?.chapter.titleEn).toBe("Updated");
    expect(result?.chapter.titleHi).toBe("अद्यतन");
    expect(result?.chapter.summaryEn).toBe("New summary");
  });

  it("requires both languages for the title", async () => {
    await expect(
      updateChapterText(master, chapterId, { titleEn: "Only English", titleHi: "  ", summaryEn: "", deliverableEn: "" }),
    ).rejects.toThrow(/both an English and a Hindi title/);
  });

  it("returns null for a chapter that does not exist", async () => {
    expect(await getChapterForAdmin(master, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("publishing", () => {
  it("refuses to publish a chapter with no notes uploaded", async () => {
    await expect(setChapterPublished(master, chapterId, true)).rejects.toThrow(/Upload the chapter notes/);
  });

  it("publishes once notes exist, and stamps published_at", async () => {
    await db.update(chapters).set({ notesFileKey: "chapters/x/notes/n.pdf" }).where(eq(chapters.id, chapterId));
    await setChapterPublished(master, chapterId, true);

    const [row] = await db
      .select({ isPublished: chapters.isPublished, publishedAt: chapters.publishedAt })
      .from(chapters)
      .where(eq(chapters.id, chapterId));
    expect(row.isPublished).toBe(true);
    expect(row.publishedAt).toBeInstanceOf(Date);
  });

  it("clears published_at when unpublished", async () => {
    await setChapterPublished(master, chapterId, false);
    const [row] = await db
      .select({ isPublished: chapters.isPublished, publishedAt: chapters.publishedAt })
      .from(chapters)
      .where(eq(chapters.id, chapterId));
    expect(row.isPublished).toBe(false);
    expect(row.publishedAt).toBeNull();
  });
});

describe("notes upload validation", () => {
  // These run without R2 credentials, so they assert the guards that fire before any
  // network call. The live upload path is covered by `npm run verify:r2`.
  it("rejects an unsupported file type", async () => {
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    await expect(uploadChapterNotes(master, chapterId, file)).rejects.toThrow(/PDF or Word/);
  });

  it("rejects an empty file", async () => {
    const file = new File([], "notes.pdf", { type: "application/pdf" });
    await expect(uploadChapterNotes(master, chapterId, file)).rejects.toThrow(/Choose a file/);
  });

  it("rejects a non-master uploader before touching storage", async () => {
    const file = new File(["x"], "notes.pdf", { type: "application/pdf" });
    await expect(uploadChapterNotes(companyAdmin, chapterId, file)).rejects.toThrow(/Only the master role/);
  });
});

describe("listing", () => {
  it("lists chapters in order with their question counts", async () => {
    const list = await listChaptersForAdmin(master);
    const ours = list.filter((chapter) => chapter.id === chapterId);
    expect(ours).toHaveLength(1);
    expect(ours[0].order).toBe(1);
    expect(ours[0].questionCount).toBe(0);
  });
});
