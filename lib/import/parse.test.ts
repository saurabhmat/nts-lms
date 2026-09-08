import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { hasBlockingErrors, parseWorkbook, type RowIssue } from "./parse";

const TEMPLATE = join(__dirname, "__fixtures__", "NTS_LMS_Content_Template.xlsx");

const CHAPTER_HEADERS = ["chapter_number", "title_en", "title_hi", "summary_en", "deliverable_en", "has_video"];
const TEST_HEADERS = [
  "chapter_number", "question_number", "question_en", "question_hi",
  "option_a_en", "option_a_hi", "option_b_en", "option_b_hi",
  "option_c_en", "option_c_hi", "option_d_en", "option_d_hi", "correct_option",
];
const PSY_HEADERS = [
  "question_number", "question_en", "question_hi",
  "option_a_en", "option_a_hi", "option_b_en", "option_b_hi",
  "option_c_en", "option_c_hi", "option_d_en", "option_d_hi",
  "trait", "score_a", "score_b", "score_c", "score_d",
];
const SETUP_HEADERS = [
  "question_number", "question_en", "question_hi", "answer_type",
  "option_a_en", "option_a_hi", "option_b_en", "option_b_hi",
  "option_c_en", "option_c_hi", "option_d_en", "option_d_hi",
];

function chapterRow(n: number) {
  return [n, `Chapter ${n}`, `अध्याय ${n}`, `Summary ${n}`, `Deliverable ${n}`, "No"];
}

function testRow(chapter: number, question: number, correct = "B") {
  return [chapter, question, "Q?", "प्रश्न?", "A en", "A hi", "B en", "B hi", null, null, null, null, correct];
}

// Builds a workbook that is valid by default; each tab can be overridden per test.
function buildWorkbook(overrides: Partial<Record<string, unknown[][]>> = {}): Buffer {
  const chapters = overrides.Chapters ?? [
    CHAPTER_HEADERS,
    ...Array.from({ length: 10 }, (_, i) => chapterRow(i + 1)),
  ];
  const tests = overrides.Chapter_Tests ?? [
    TEST_HEADERS,
    ...Array.from({ length: 10 }, (_, i) => testRow(i + 1, 1)),
  ];
  const psychometric = overrides.Psychometric ?? [
    [...PSY_HEADERS, null, "Score band", "Analysis shown to the user"],
    [1, "Q?", "प्रश्न?", "A en", "A hi", "B en", "B hi", null, null, null, null, "Persistence", 1, 4, null, null, null, "0–50% (Developing)", "You are developing."],
    [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "51–100% (Strong)", "You are strong."],
  ];
  const setup = overrides.Setup_Questionnaire ?? [
    SETUP_HEADERS,
    [1, "How long?", "कितने समय?", "choice", "A en", "A hi", "B en", "B hi", null, null, null, null],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chapters), "Chapters");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tests), "Chapter_Tests");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(psychometric), "Psychometric");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(setup), "Setup_Questionnaire");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function errorsFor(issues: RowIssue[], tab: string) {
  return issues.filter((issue) => issue.tab === tab && issue.level === "error");
}

describe("parseWorkbook — the real customer template", () => {
  it("reads every tab of NTS_LMS_Content_Template.xlsx without crashing", () => {
    const result = parseWorkbook(readFileSync(TEMPLATE));

    // The shipped template holds one grey example row per tab and is otherwise empty,
    // so it must parse structurally while still reporting the unfilled chapters.
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]).toMatchObject({ chapterNumber: 1, titleEn: "Sales Ignite" });
    expect(result.chapterTests).toHaveLength(1);
    expect(result.chapterTests[0]).toMatchObject({ chapterNumber: 1, correctOption: "B" });
    expect(result.psychometric).toHaveLength(1);
    expect(result.psychometric[0].optionScores).toEqual({ A: 1, B: 2, C: 4, D: 3 });
    expect(result.setup).toHaveLength(1);
  });

  it("finds the four score bands hidden in the Psychometric side columns", () => {
    const result = parseWorkbook(readFileSync(TEMPLATE));
    expect(result.analysisBands.map((band) => band.label)).toEqual([
      "Developing", "Emerging", "Competent", "Strong",
    ]);
    expect(result.analysisBands[0]).toMatchObject({ minPct: 0, maxPct: 25 });
    expect(result.analysisBands[3]).toMatchObject({ minPct: 76, maxPct: 100 });
  });

  it("flags that the shipped template's band analysis text is still unfilled", () => {
    const result = parseWorkbook(readFileSync(TEMPLATE));
    const unfilled = result.issues.filter((issue) => issue.message.includes("no analysis text"));
    expect(unfilled).toHaveLength(4);
    expect(result.analysisBands.every((band) => band.body === "")).toBe(true);
  });

  it("does not mistake the instruction prose beside the bands for a band", () => {
    const result = parseWorkbook(readFileSync(TEMPLATE));
    expect(result.analysisBands).toHaveLength(4);
    for (const band of result.analysisBands) {
      expect(band.label).not.toMatch(/write one paragraph|trait|points awarded/i);
    }
  });

  it("reports the 9 unfilled chapters rather than silently importing one", () => {
    const result = parseWorkbook(readFileSync(TEMPLATE));
    const missing = result.issues.filter((issue) => /Chapter \d+ is missing/.test(issue.message));
    expect(missing).toHaveLength(9);
    expect(hasBlockingErrors(result.issues)).toBe(true);
  });
});

describe("parseWorkbook — a fully valid workbook", () => {
  it("parses with no blocking errors", () => {
    const result = parseWorkbook(buildWorkbook());
    expect(hasBlockingErrors(result.issues)).toBe(false);
    expect(result.chapters).toHaveLength(10);
    expect(result.chapterTests).toHaveLength(10);
    expect(result.analysisBands).toHaveLength(2);
  });

  it("ignores has_video, which is out of scope", () => {
    const result = parseWorkbook(buildWorkbook());
    expect(result.chapters[0]).not.toHaveProperty("hasVideo");
  });
});

describe("parseWorkbook — validation", () => {
  it("rejects a correct_option that matches no option on the row", () => {
    const result = parseWorkbook(
      buildWorkbook({ Chapter_Tests: [TEST_HEADERS, testRow(1, 1, "D")] }),
    );
    const errors = errorsFor(result.issues, "Chapter_Tests");
    expect(errors[0].message).toContain('correct_option "D" does not match');
    expect(errors[0].row).toBe(2);
  });

  it("rejects a question missing its Hindi text", () => {
    const row = testRow(1, 1);
    row[3] = null;
    const result = parseWorkbook(buildWorkbook({ Chapter_Tests: [TEST_HEADERS, row] }));
    expect(errorsFor(result.issues, "Chapter_Tests")[0].message).toContain("missing its Hindi text");
  });

  it("reports missing chapters by number", () => {
    const result = parseWorkbook(
      buildWorkbook({ Chapters: [CHAPTER_HEADERS, chapterRow(1), chapterRow(2)] }),
    );
    const missing = result.issues.filter((issue) => /Chapter \d+ is missing/.test(issue.message));
    expect(missing).toHaveLength(8);
  });

  it("reports a file that is not a spreadsheet instead of throwing", () => {
    const result = parseWorkbook(Buffer.from("this is definitely not an xlsx file"));
    expect(result.issues[0].message).toContain("could not be read");
    expect(result.chapters).toHaveLength(0);
  });

  it("flags a duplicate chapter number", () => {
    const rows = [CHAPTER_HEADERS, ...Array.from({ length: 10 }, (_, i) => chapterRow(i + 1)), chapterRow(3)];
    const result = parseWorkbook(buildWorkbook({ Chapters: rows }));
    const duplicate = errorsFor(result.issues, "Chapters").find((issue) => issue.message.includes("already defined"));
    expect(duplicate?.message).toContain("Chapter 3 is already defined on row 4");
    expect(duplicate?.row).toBe(12);
  });

  it("rejects a psychometric option with no score, rather than scoring it zero", () => {
    const result = parseWorkbook(
      buildWorkbook({
        Psychometric: [
          [...PSY_HEADERS, null, "Score band", "Analysis shown to the user"],
          [1, "Q?", "प्रश्न?", "A en", "A hi", "B en", "B hi", null, null, null, null, "Persistence", 1, null, null, null, null, "0–100% (All)", "text"],
        ],
      }),
    );
    expect(errorsFor(result.issues, "Psychometric")[0].message).toContain("score_b is missing");
  });

  it("rejects a band with no analysis text", () => {
    const result = parseWorkbook(
      buildWorkbook({
        Psychometric: [
          [...PSY_HEADERS, null, "Score band", "Analysis shown to the user"],
          [1, "Q?", "प्रश्न?", "A en", "A hi", "B en", "B hi", null, null, null, null, "P", 1, 2, null, null, null, "0–100% (All)", null],
        ],
      }),
    );
    expect(errorsFor(result.issues, "Psychometric").some((i) => i.message.includes("no analysis text"))).toBe(true);
  });

  it("flags overlapping bands", () => {
    const result = parseWorkbook(
      buildWorkbook({
        Psychometric: [
          [...PSY_HEADERS, null, "Score band", "Analysis shown to the user"],
          [1, "Q?", "प्रश्न?", "A en", "A hi", "B en", "B hi", null, null, null, null, "P", 1, 2, null, null, null, "0–60% (Low)", "low"],
          [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "50–100% (High)", "high"],
        ],
      }),
    );
    expect(result.issues.some((i) => i.message.includes("overlaps"))).toBe(true);
  });

  it("keeps a free-text setup question with no options", () => {
    const result = parseWorkbook(
      buildWorkbook({
        Setup_Questionnaire: [
          SETUP_HEADERS,
          [1, "Describe your process", "अपनी प्रक्रिया बताएं", "text", null, null, null, null, null, null, null, null],
        ],
      }),
    );
    expect(errorsFor(result.issues, "Setup_Questionnaire")).toHaveLength(0);
    expect(result.setup[0]).toMatchObject({ answerType: "text", options: [] });
  });

  it("reports a missing tab instead of throwing", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CHAPTER_HEADERS]), "Chapters");
    const result = parseWorkbook(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
    expect(result.issues.some((i) => i.message.includes('"Chapter_Tests" tab is missing'))).toBe(true);
  });

  it("collects errors row by row instead of failing the whole file on one bad row", () => {
    const bad = testRow(1, 2, "Z");
    const result = parseWorkbook(
      buildWorkbook({ Chapter_Tests: [TEST_HEADERS, testRow(1, 1), bad, testRow(1, 3)] }),
    );
    expect(result.chapterTests).toHaveLength(2);
    expect(errorsFor(result.issues, "Chapter_Tests")).toHaveLength(1);
  });
});
