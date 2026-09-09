import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { getDb } from "@/db";
import {
  analyses,
  analysisBands as analysisBandsTable,
  authUsers,
  chapters as chaptersTable,
  courses,
  questionSets,
  questions as questionsTable,
} from "@/db/schema";
import type { SessionScope } from "@/lib/db/org-scope";

import { commitWorkbook } from "./commit";
import { parseWorkbook } from "./parse";

const db = getDb();
const master: SessionScope = { userId: "import-test-master", role: "master", organizationId: null };
const learner: SessionScope = { userId: "import-test-learner", role: "learner", organizationId: null };

const CHAPTER_HEADERS = ["chapter_number", "title_en", "title_hi", "summary_en", "deliverable_en", "has_video"];
const TEST_HEADERS = [
  "chapter_number", "question_number", "question_en", "question_hi",
  "option_a_en", "option_a_hi", "option_b_en", "option_b_hi", "correct_option",
];
const PSY_HEADERS = [
  "question_number", "question_en", "question_hi",
  "option_a_en", "option_a_hi", "option_b_en", "option_b_hi",
  "trait", "score_a", "score_b",
];
const SETUP_HEADERS = ["question_number", "question_en", "question_hi", "answer_type"];

function buildWorkbook(opts: { chapterTitle?: string; questionsPerChapter?: number } = {}) {
  const title = opts.chapterTitle ?? "Chapter";
  const perChapter = opts.questionsPerChapter ?? 2;

  const chapters = [
    CHAPTER_HEADERS,
    ...Array.from({ length: 10 }, (_, i) => [i + 1, `${title} ${i + 1}`, `अध्याय ${i + 1}`, `Summary ${i + 1}`, `Deliverable ${i + 1}`, "No"]),
  ];
  const tests: unknown[][] = [TEST_HEADERS];
  for (let c = 1; c <= 10; c++) {
    for (let q = 1; q <= perChapter; q++) {
      tests.push([c, q, `Q${c}.${q}`, `प्रश्न${c}.${q}`, "A en", "A hi", "B en", "B hi", "B"]);
    }
  }
  const psychometric = [
    [...PSY_HEADERS, null, "Score band", "Analysis shown to the user"],
    [1, "Psy Q1", "मनो प्रश्न1", "A en", "A hi", "B en", "B hi", "Persistence", 1, 4, null, "0–50% (Developing)", "Developing text."],
    [2, "Psy Q2", "मनो प्रश्न2", "A en", "A hi", "B en", "B hi", "Discipline", 2, 3, null, "51–100% (Strong)", "Strong text."],
  ];
  const setup = [SETUP_HEADERS, [1, "Describe your process", "प्रक्रिया बताएं", "text"]];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chapters), "Chapters");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tests), "Chapter_Tests");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(psychometric), "Psychometric");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(setup), "Setup_Questionnaire");
  return parseWorkbook(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

async function currentCourseId() {
  const [course] = await db.select().from(courses).where(eq(courses.slug, "nts-sales-mastery")).limit(1);
  return course?.id ?? null;
}

async function cleanup() {
  const courseId = await currentCourseId();
  if (courseId) {
    // question_sets and questions cascade from chapters; bands are global.
    await db.delete(chaptersTable).where(eq(chaptersTable.courseId, courseId));
    await db.delete(courses).where(eq(courses.id, courseId));
  }
  await db.delete(questionSets).where(inArray(questionSets.type, ["psychometric", "setup"]));
  await db.delete(authUsers).where(eq(authUsers.id, ANALYSIS_LEARNER));
  await db.delete(analysisBandsTable);
}

const ANALYSIS_LEARNER = "import-test-analysis-learner";

describe("commitWorkbook (integration)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("refuses a non-master caller", async () => {
    await expect(commitWorkbook(learner, buildWorkbook())).rejects.toThrow(/Only the master role/);
  });

  it("refuses a workbook that still has errors", async () => {
    const broken = buildWorkbook();
    broken.issues.push({ tab: "Chapters", row: 4, level: "error", message: "boom" });
    await expect(commitWorkbook(master, broken)).rejects.toThrow(/still has errors/);
  });

  it("imports chapters, tests, psychometric, setup and bands", async () => {
    const summary = await commitWorkbook(master, buildWorkbook());

    expect(summary.chaptersCreated).toBe(10);
    expect(summary.chaptersUpdated).toBe(0);
    expect(summary.chapterTestQuestions).toBe(20);
    expect(summary.psychometricQuestions).toBe(2);
    expect(summary.setupQuestions).toBe(1);
    expect(summary.analysisBands).toBe(2);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(questionsTable);
    expect(count).toBe(23); // 20 chapter-test + 2 psychometric + 1 setup
  });

  it("is idempotent: re-importing replaces rather than duplicating", async () => {
    const summary = await commitWorkbook(master, buildWorkbook());

    expect(summary.chaptersCreated).toBe(0);
    expect(summary.chaptersUpdated).toBe(10);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(questionsTable);
    expect(count).toBe(23);

    const bands = await db.select().from(analysisBandsTable);
    expect(bands).toHaveLength(2);
  });

  it("updates chapter text in place, keeping the same chapter ids", async () => {
    const courseId = await currentCourseId();
    const before = await db
      .select({ id: chaptersTable.id, order: chaptersTable.order })
      .from(chaptersTable)
      .where(eq(chaptersTable.courseId, courseId!))
      .orderBy(chaptersTable.order);

    await commitWorkbook(master, buildWorkbook({ chapterTitle: "Renamed" }));

    const after = await db
      .select({ id: chaptersTable.id, order: chaptersTable.order, titleEn: chaptersTable.titleEn })
      .from(chaptersTable)
      .where(eq(chaptersTable.courseId, courseId!))
      .orderBy(chaptersTable.order);

    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
    expect(after[0].titleEn).toBe("Renamed 1");
  });

  it("preserves an uploaded notes file and published state across a re-import", async () => {
    const courseId = await currentCourseId();
    const [chapter] = await db
      .select({ id: chaptersTable.id })
      .from(chaptersTable)
      .where(eq(chaptersTable.courseId, courseId!))
      .orderBy(chaptersTable.order)
      .limit(1);

    await db
      .update(chaptersTable)
      .set({ notesFileKey: "chapters/x/notes/abc-notes.pdf", isPublished: true })
      .where(eq(chaptersTable.id, chapter.id));

    await commitWorkbook(master, buildWorkbook({ chapterTitle: "Again" }));

    const [after] = await db
      .select({ notesFileKey: chaptersTable.notesFileKey, isPublished: chaptersTable.isPublished })
      .from(chaptersTable)
      .where(eq(chaptersTable.id, chapter.id));

    expect(after.notesFileKey).toBe("chapters/x/notes/abc-notes.pdf");
    expect(after.isPublished).toBe(true);
  });

  it("shrinks a question set when the workbook has fewer questions", async () => {
    await commitWorkbook(master, buildWorkbook({ questionsPerChapter: 1 }));
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(questionsTable);
    expect(count).toBe(13); // 10 chapter-test + 2 psychometric + 1 setup
  });

  it("stores psychometric option scores and no correct answer", async () => {
    const [set] = await db
      .select({ id: questionSets.id })
      .from(questionSets)
      .where(eq(questionSets.type, "psychometric"))
      .limit(1);
    const rows = await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.setId, set.id))
      .orderBy(questionsTable.order);

    expect(rows[0].optionScores).toEqual({ A: 1, B: 4 });
    expect(rows[0].correctOption).toBeNull();
    expect(rows[0].trait).toBe("Persistence");
  });

  it("stores chapter-test questions with a correct answer and no scores", async () => {
    const [set] = await db
      .select({ id: questionSets.id })
      .from(questionSets)
      .where(eq(questionSets.type, "chapter_test"))
      .limit(1);
    const [row] = await db.select().from(questionsTable).where(eq(questionsTable.setId, set.id)).limit(1);

    expect(row.correctOption).toBe("B");
    expect(row.optionScores).toBeNull();
    expect(row.options).toEqual([
      { key: "A", en: "A en", hi: "A hi" },
      { key: "B", en: "B en", hi: "B hi" },
    ]);
  });

  // Regression: analysis_bands are replaced wholesale on every import, and learners' analyses
  // rows point at them. When band_id was NOT NULL with no delete rule, the second import threw
  // a foreign key violation and rolled back the whole thing -- so a trainer could never correct
  // their content once anyone had taken the psychometric.
  it("re-imports successfully after a learner has a recorded analysis", async () => {
    await db.insert(authUsers).values({
      id: ANALYSIS_LEARNER,
      name: "Analysis Learner",
      email: "import-test-analysis@example.com",
    });

    const before = await db.select().from(analysisBandsTable).orderBy(analysisBandsTable.minPct);
    const developing = before.find((band) => band.label === "Developing")!;

    // 30% sits inside a band; 50.5% falls in the gap the fixture's 0-50 / 51-100 bands leave.
    await db.insert(analyses).values([
      { userId: ANALYSIS_LEARNER, psychometricScore: 30, bandId: developing.id },
      { userId: ANALYSIS_LEARNER, psychometricScore: 50.5, bandId: developing.id },
    ]);

    await expect(commitWorkbook(master, buildWorkbook())).resolves.toBeDefined();

    const rows = await db
      .select()
      .from(analyses)
      .where(eq(analyses.userId, ANALYSIS_LEARNER))
      .orderBy(analyses.psychometricScore);

    // The scores survive: they are the learner's real result, not commentary.
    expect(rows.map((row) => row.psychometricScore)).toEqual([30, 50.5]);

    const after = await db.select().from(analysisBandsTable);
    const covered = rows.find((row) => row.psychometricScore === 30)!;
    const uncovered = rows.find((row) => row.psychometricScore === 50.5)!;

    // Re-pointed at the freshly imported band, not the deleted one.
    expect(covered.bandId).not.toBeNull();
    expect(covered.bandId).not.toBe(developing.id);
    expect(after.find((band) => band.id === covered.bandId)?.label).toBe("Developing");

    // No new band covers 50.5, so it loses its commentary rather than blocking the import.
    expect(uncovered.bandId).toBeNull();
  });

  it("fills Hindi band text from the English column the template provides", async () => {
    const bands = await db.select().from(analysisBandsTable).orderBy(analysisBandsTable.minPct);
    expect(bands[0].bodyEn).toBe("Developing text.");
    expect(bands[0].bodyHi).toBe("Developing text.");
  });
});

describe("commitWorkbook — the real customer template", () => {
  it("will not import the shipped template, because its content is unfilled", async () => {
    const parsed = parseWorkbook(readFileSync(join(__dirname, "__fixtures__", "NTS_LMS_Content_Template.xlsx")));
    await expect(commitWorkbook(master, parsed)).rejects.toThrow(/still has errors/);
  });
});
