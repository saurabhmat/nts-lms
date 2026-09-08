import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { chapters, courses, questionSets, questions } from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";
import { chapterNotesKey, deleteObject, isR2Configured, presignedDownloadUrl, putObject } from "@/lib/r2";

// Keep in step with serverActions.bodySizeLimit in next.config.ts, which must be larger
// than this to leave room for the rest of the multipart body.
export const MAX_NOTES_BYTES = 20 * 1024 * 1024;

const ALLOWED_NOTES_TYPES = new Map<string, string>([
  ["pdf", "application/pdf"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
]);

function assertMaster(session: SessionScope) {
  if (session.role !== "master") {
    throw new Error("Only the master role can edit course content");
  }
}

export async function listChaptersForAdmin(session: SessionScope) {
  assertMaster(session);
  const db = getDb();

  return db
    .select({
      id: chapters.id,
      order: chapters.order,
      titleEn: chapters.titleEn,
      titleHi: chapters.titleHi,
      isPublished: chapters.isPublished,
      notesFileKey: chapters.notesFileKey,
      questionCount: sql<number>`(
        select count(*)::int from questions q
        join question_sets s on s.id = q.set_id
        where s.chapter_id = ${chapters.id}
      )`,
    })
    .from(chapters)
    .innerJoin(courses, eq(courses.id, chapters.courseId))
    .orderBy(asc(chapters.order));
}

export async function getChapterForAdmin(session: SessionScope, chapterId: string) {
  assertMaster(session);
  const db = getDb();

  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  if (!chapter) return null;

  const chapterQuestions = await db
    .select({
      id: questions.id,
      order: questions.order,
      promptEn: questions.promptEn,
      promptHi: questions.promptHi,
      options: questions.options,
      correctOption: questions.correctOption,
    })
    .from(questions)
    .innerJoin(questionSets, eq(questionSets.id, questions.setId))
    .where(and(eq(questionSets.chapterId, chapterId), eq(questionSets.type, "chapter_test")))
    .orderBy(asc(questions.order));

  return { chapter, questions: chapterQuestions };
}

export async function updateChapterText(
  session: SessionScope,
  chapterId: string,
  input: { titleEn: string; titleHi: string; summaryEn: string; deliverableEn: string },
) {
  assertMaster(session);
  if (!input.titleEn.trim() || !input.titleHi.trim()) {
    throw new Error("A chapter needs both an English and a Hindi title");
  }

  const db = getDb();
  await db
    .update(chapters)
    .set({
      titleEn: input.titleEn.trim(),
      titleHi: input.titleHi.trim(),
      summaryEn: input.summaryEn.trim(),
      deliverableEn: input.deliverableEn.trim(),
    })
    .where(eq(chapters.id, chapterId));
}

export async function uploadChapterNotes(session: SessionScope, chapterId: string, file: File) {
  assertMaster(session);

  // Validate the file before checking storage config, so the admin is told what is wrong
  // with their file rather than being handed an unrelated infrastructure error.
  if (file.size === 0) throw new Error("Choose a file to upload");
  if (file.size > MAX_NOTES_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_NOTES_BYTES / 1024 / 1024} MB.`);
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = ALLOWED_NOTES_TYPES.get(extension);
  if (!contentType) {
    throw new Error("Chapter notes must be a PDF or Word document (.pdf, .doc, .docx)");
  }

  if (!isR2Configured()) {
    throw new Error("File storage is not configured yet, so notes cannot be uploaded.");
  }

  const db = getDb();
  const [chapter] = await db
    .select({ id: chapters.id, notesFileKey: chapters.notesFileKey })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  if (!chapter) throw new Error("Chapter not found");

  const key = chapterNotesKey(chapterId, file.name);
  await putObject(key, Buffer.from(await file.arrayBuffer()), contentType);
  await db.update(chapters).set({ notesFileKey: key }).where(eq(chapters.id, chapterId));

  // Best-effort cleanup of the file this one replaces. A failure here leaves an orphaned
  // object in the bucket, which is far better than failing an upload that already
  // succeeded and is already recorded against the chapter.
  if (chapter.notesFileKey && chapter.notesFileKey !== key) {
    try {
      await deleteObject(chapter.notesFileKey);
    } catch (error) {
      console.error(`[r2] could not delete replaced notes object ${chapter.notesFileKey}:`, error);
    }
  }

  return key;
}

/**
 * Generates a short-lived download URL for a chapter's notes.
 *
 * The ownership check happens here, server-side, and the bucket key never reaches the
 * client (docs/spec.md §3). Today only the master reads notes through the chapter
 * editor; the learner-side check belongs with the course interface, which also owns the
 * unlock rules that decide whether a given learner may read a given chapter at all.
 */
export async function getChapterNotesUrl(session: SessionScope, chapterId: string): Promise<string | null> {
  assertMaster(session);
  const db = getDb();

  const [chapter] = await db
    .select({ notesFileKey: chapters.notesFileKey })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  if (!chapter?.notesFileKey) return null;

  return presignedDownloadUrl(chapter.notesFileKey);
}

export async function setChapterPublished(session: SessionScope, chapterId: string, published: boolean) {
  assertMaster(session);
  const db = getDb();

  const [chapter] = await db
    .select({ notesFileKey: chapters.notesFileKey, titleEn: chapters.titleEn })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  if (!chapter) throw new Error("Chapter not found");

  if (published && !chapter.notesFileKey) {
    throw new Error("Upload the chapter notes before publishing this chapter");
  }

  await db
    .update(chapters)
    .set({ isPublished: published, publishedAt: published ? new Date() : null })
    .where(eq(chapters.id, chapterId));
}
