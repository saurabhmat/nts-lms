import * as XLSX from "xlsx";

// Pure parsing and validation for NTS_LMS_Content_Template.xlsx. No database access --
// the import flow parses first, shows a preview, and only then commits (docs/spec.md §6).
//
// Row numbers in every issue are 1-based *spreadsheet* rows (the number shown in Excel's
// gutter), so the trainer can find and fix the row directly.

export type IssueLevel = "error" | "warning";

export type RowIssue = {
  tab: string;
  row: number | null;
  message: string;
  level: IssueLevel;
};

export type ParsedOption = { key: string; en: string; hi: string };

export type ParsedChapter = {
  row: number;
  chapterNumber: number;
  titleEn: string;
  titleHi: string;
  summaryEn: string;
  deliverableEn: string;
};

export type ParsedQuestion = {
  row: number;
  questionNumber: number;
  promptEn: string;
  promptHi: string;
  options: ParsedOption[];
  correctOption: string | null;
  trait: string | null;
  optionScores: Record<string, number> | null;
  answerType: "choice" | "text";
};

export type ParsedChapterTestQuestion = ParsedQuestion & { chapterNumber: number };

export type ParsedBand = {
  row: number;
  minPct: number;
  maxPct: number;
  label: string;
  body: string;
};

export type ParsedWorkbook = {
  chapters: ParsedChapter[];
  chapterTests: ParsedChapterTestQuestion[];
  psychometric: ParsedQuestion[];
  analysisBands: ParsedBand[];
  setup: ParsedQuestion[];
  issues: RowIssue[];
};

const OPTION_KEYS = ["A", "B", "C", "D"] as const;
const REQUIRED_TABS = ["Chapters", "Chapter_Tests", "Psychometric", "Setup_Questionnaire"];
const EXPECTED_CHAPTER_COUNT = 10;

type Grid = (string | number | null)[][];

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberOrNull(value: unknown): number | null {
  const text = cell(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function sheetGrid(workbook: XLSX.WorkBook, name: string): Grid | null {
  const sheet = workbook.Sheets[name];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json<Grid[number]>(sheet, { header: 1, defval: null, blankrows: true });
}

// Maps the template's header row to column indexes by name, so trailing annotation
// columns (the "__EMPTY" spacers and the instruction text the template carries beside
// the real data) are ignored rather than mistaken for content.
function headerIndex(grid: Grid): Map<string, number> {
  const header = grid[0] ?? [];
  const map = new Map<string, number>();
  header.forEach((raw, index) => {
    const name = cell(raw).toLowerCase();
    if (name && !map.has(name)) map.set(name, index);
  });
  return map;
}

function isBlankRow(row: Grid[number], columns: number[]): boolean {
  return columns.every((index) => !cell(row?.[index]));
}

function parseOptions(
  row: Grid[number],
  headers: Map<string, number>,
  tab: string,
  rowNumber: number,
  issues: RowIssue[],
): ParsedOption[] {
  const options: ParsedOption[] = [];
  for (const key of OPTION_KEYS) {
    const lower = key.toLowerCase();
    const enIndex = headers.get(`option_${lower}_en`);
    const hiIndex = headers.get(`option_${lower}_hi`);
    const en = enIndex === undefined ? "" : cell(row[enIndex]);
    const hi = hiIndex === undefined ? "" : cell(row[hiIndex]);

    if (!en && !hi) continue;
    if (en && !hi) {
      issues.push({
        tab,
        row: rowNumber,
        level: "error",
        message: `Option ${key} has English text but no Hindi text.`,
      });
      continue;
    }
    if (!en && hi) {
      issues.push({
        tab,
        row: rowNumber,
        level: "error",
        message: `Option ${key} has Hindi text but no English text.`,
      });
      continue;
    }
    options.push({ key, en, hi });
  }
  return options;
}

function parsePrompt(
  row: Grid[number],
  headers: Map<string, number>,
  tab: string,
  rowNumber: number,
  issues: RowIssue[],
): { promptEn: string; promptHi: string } | null {
  const promptEn = cell(row[headers.get("question_en") ?? -1]);
  const promptHi = cell(row[headers.get("question_hi") ?? -1]);

  if (!promptEn && !promptHi) {
    issues.push({ tab, row: rowNumber, level: "error", message: "Question text is missing." });
    return null;
  }
  if (!promptEn) {
    issues.push({ tab, row: rowNumber, level: "error", message: "Question is missing its English text." });
    return null;
  }
  if (!promptHi) {
    issues.push({ tab, row: rowNumber, level: "error", message: "Question is missing its Hindi text." });
    return null;
  }
  return { promptEn, promptHi };
}

function parseChapters(workbook: XLSX.WorkBook, issues: RowIssue[]): ParsedChapter[] {
  const grid = sheetGrid(workbook, "Chapters");
  if (!grid) return [];
  const headers = headerIndex(grid);
  const dataColumns = ["chapter_number", "title_en", "title_hi", "summary_en", "deliverable_en"]
    .map((name) => headers.get(name))
    .filter((index): index is number => index !== undefined);

  const chapters: ParsedChapter[] = [];
  const seen = new Map<number, number>();

  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rowNumber = i + 1;
    if (isBlankRow(row, dataColumns)) continue;

    const chapterNumber = numberOrNull(row[headers.get("chapter_number") ?? -1]);
    const titleEn = cell(row[headers.get("title_en") ?? -1]);
    const titleHi = cell(row[headers.get("title_hi") ?? -1]);
    const summaryEn = cell(row[headers.get("summary_en") ?? -1]);
    const deliverableEn = cell(row[headers.get("deliverable_en") ?? -1]);

    if (chapterNumber === null) {
      issues.push({ tab: "Chapters", row: rowNumber, level: "error", message: "chapter_number is missing or not a number." });
      continue;
    }
    // A chapter row with a number but nothing else is an unfilled template row, not an error.
    if (!titleEn && !titleHi && !summaryEn && !deliverableEn) continue;

    if (seen.has(chapterNumber)) {
      issues.push({
        tab: "Chapters",
        row: rowNumber,
        level: "error",
        message: `Chapter ${chapterNumber} is already defined on row ${seen.get(chapterNumber)}.`,
      });
      continue;
    }
    if (!titleEn || !titleHi) {
      issues.push({
        tab: "Chapters",
        row: rowNumber,
        level: "error",
        message: `Chapter ${chapterNumber} needs both an English and a Hindi title.`,
      });
      continue;
    }

    seen.set(chapterNumber, rowNumber);
    chapters.push({ row: rowNumber, chapterNumber, titleEn, titleHi, summaryEn, deliverableEn });
  }

  for (let n = 1; n <= EXPECTED_CHAPTER_COUNT; n++) {
    if (!seen.has(n)) {
      issues.push({ tab: "Chapters", row: null, level: "error", message: `Chapter ${n} is missing.` });
    }
  }

  return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

function parseChapterTests(
  workbook: XLSX.WorkBook,
  knownChapters: Set<number>,
  issues: RowIssue[],
): ParsedChapterTestQuestion[] {
  const grid = sheetGrid(workbook, "Chapter_Tests");
  if (!grid) return [];
  const headers = headerIndex(grid);
  const dataColumns = ["chapter_number", "question_number", "question_en", "question_hi", "correct_option"]
    .map((name) => headers.get(name))
    .filter((index): index is number => index !== undefined);

  const questions: ParsedChapterTestQuestion[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rowNumber = i + 1;
    if (isBlankRow(row, dataColumns)) continue;

    const chapterNumber = numberOrNull(row[headers.get("chapter_number") ?? -1]);
    const questionNumber = numberOrNull(row[headers.get("question_number") ?? -1]);

    if (chapterNumber === null) {
      issues.push({ tab: "Chapter_Tests", row: rowNumber, level: "error", message: "chapter_number is missing or not a number." });
      continue;
    }
    if (questionNumber === null) {
      issues.push({ tab: "Chapter_Tests", row: rowNumber, level: "error", message: "question_number is missing or not a number." });
      continue;
    }
    if (!knownChapters.has(chapterNumber)) {
      issues.push({
        tab: "Chapter_Tests",
        row: rowNumber,
        level: "error",
        message: `Chapter ${chapterNumber} is not defined on the Chapters tab.`,
      });
      continue;
    }

    const dedupeKey = `${chapterNumber}:${questionNumber}`;
    if (seen.has(dedupeKey)) {
      issues.push({
        tab: "Chapter_Tests",
        row: rowNumber,
        level: "error",
        message: `Chapter ${chapterNumber} question ${questionNumber} is already defined on row ${seen.get(dedupeKey)}.`,
      });
      continue;
    }

    const prompt = parsePrompt(row, headers, "Chapter_Tests", rowNumber, issues);
    if (!prompt) continue;

    const options = parseOptions(row, headers, "Chapter_Tests", rowNumber, issues);
    if (options.length < 2) {
      issues.push({ tab: "Chapter_Tests", row: rowNumber, level: "error", message: "A test question needs at least two options." });
      continue;
    }

    const correctOption = cell(row[headers.get("correct_option") ?? -1]).toUpperCase();
    if (!correctOption) {
      issues.push({ tab: "Chapter_Tests", row: rowNumber, level: "error", message: "correct_option is missing." });
      continue;
    }
    if (!options.some((option) => option.key === correctOption)) {
      issues.push({
        tab: "Chapter_Tests",
        row: rowNumber,
        level: "error",
        message: `correct_option "${correctOption}" does not match any option on this row (has ${options.map((o) => o.key).join(", ")}).`,
      });
      continue;
    }

    seen.set(dedupeKey, rowNumber);
    questions.push({
      row: rowNumber,
      chapterNumber,
      questionNumber,
      ...prompt,
      options,
      correctOption,
      trait: null,
      optionScores: null,
      answerType: "choice",
    });
  }

  return questions.sort((a, b) => a.chapterNumber - b.chapterNumber || a.questionNumber - b.questionNumber);
}

function parsePsychometric(workbook: XLSX.WorkBook, issues: RowIssue[]): ParsedQuestion[] {
  const grid = sheetGrid(workbook, "Psychometric");
  if (!grid) return [];
  const headers = headerIndex(grid);
  const dataColumns = ["question_number", "question_en", "question_hi"]
    .map((name) => headers.get(name))
    .filter((index): index is number => index !== undefined);

  const questions: ParsedQuestion[] = [];
  const seen = new Map<number, number>();

  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rowNumber = i + 1;
    if (isBlankRow(row, dataColumns)) continue;

    const questionNumber = numberOrNull(row[headers.get("question_number") ?? -1]);
    if (questionNumber === null) {
      issues.push({ tab: "Psychometric", row: rowNumber, level: "error", message: "question_number is missing or not a number." });
      continue;
    }
    if (seen.has(questionNumber)) {
      issues.push({
        tab: "Psychometric",
        row: rowNumber,
        level: "error",
        message: `Question ${questionNumber} is already defined on row ${seen.get(questionNumber)}.`,
      });
      continue;
    }

    const prompt = parsePrompt(row, headers, "Psychometric", rowNumber, issues);
    if (!prompt) continue;

    const options = parseOptions(row, headers, "Psychometric", rowNumber, issues);
    if (options.length < 2) {
      issues.push({ tab: "Psychometric", row: rowNumber, level: "error", message: "A psychometric question needs at least two options." });
      continue;
    }

    // Psychometric questions score every option instead of having one correct answer
    // (docs/spec.md §7). A missing score is an error, not a zero -- silently scoring an
    // unfilled cell as 0 would skew the band the learner is placed in.
    const optionScores: Record<string, number> = {};
    let scoresValid = true;
    for (const option of options) {
      const scoreIndex = headers.get(`score_${option.key.toLowerCase()}`);
      const score = scoreIndex === undefined ? null : numberOrNull(row[scoreIndex]);
      if (score === null) {
        issues.push({
          tab: "Psychometric",
          row: rowNumber,
          level: "error",
          message: `score_${option.key.toLowerCase()} is missing for option ${option.key}.`,
        });
        scoresValid = false;
        continue;
      }
      optionScores[option.key] = score;
    }
    if (!scoresValid) continue;

    seen.set(questionNumber, rowNumber);
    questions.push({
      row: rowNumber,
      questionNumber,
      ...prompt,
      options,
      correctOption: null,
      trait: cell(row[headers.get("trait") ?? -1]) || null,
      optionScores,
      answerType: "choice",
    });
  }

  return questions.sort((a, b) => a.questionNumber - b.questionNumber);
}

// The analysis bands live in two extra columns on the Psychometric tab ("Score band" and
// "Analysis shown to the user"), below a sub-header, alongside free-form instruction text
// the template author left in the same column. Only rows whose band cell actually parses
// as a percentage range are treated as bands; anything else in the column is ignored.
const BAND_PATTERN = /^\s*(\d+)\s*[-–—]\s*(\d+)\s*%?\s*(?:\((.+)\))?\s*$/;

function parseAnalysisBands(workbook: XLSX.WorkBook, issues: RowIssue[]): ParsedBand[] {
  const grid = sheetGrid(workbook, "Psychometric");
  if (!grid) return [];

  let bandColumn = -1;
  let bodyColumn = -1;
  for (let i = 0; i < Math.min(grid.length, 5) && bandColumn === -1; i++) {
    const row = grid[i] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (cell(row[c]).toLowerCase() === "score band") {
        bandColumn = c;
        bodyColumn = c + 1;
        break;
      }
    }
  }
  if (bandColumn === -1) {
    issues.push({
      tab: "Psychometric",
      row: null,
      level: "error",
      message: 'Could not find the "Score band" analysis-text column on the Psychometric tab.',
    });
    return [];
  }

  const bands: ParsedBand[] = [];
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rowNumber = i + 1;
    const bandText = cell(row[bandColumn]);
    if (!bandText) continue;

    const match = BAND_PATTERN.exec(bandText);
    if (!match) continue; // instruction prose in the same column -- not a band

    const minPct = Number(match[1]);
    const maxPct = Number(match[2]);
    const label = (match[3] ?? "").trim() || `${minPct}-${maxPct}%`;
    const body = cell(row[bodyColumn]);

    if (minPct > maxPct) {
      issues.push({ tab: "Psychometric", row: rowNumber, level: "error", message: `Band "${bandText}" has a minimum above its maximum.` });
      continue;
    }
    // A band with no analysis text is still shown in the preview -- the trainer needs to
    // see which band is unfilled, not just "no bands found". The error still blocks commit.
    if (!body) {
      issues.push({
        tab: "Psychometric",
        row: rowNumber,
        level: "error",
        message: `Band "${label}" has no analysis text. This is what the learner reads after the assessment.`,
      });
    }

    bands.push({ row: rowNumber, minPct, maxPct, label, body });
  }

  if (bands.length === 0) {
    issues.push({ tab: "Psychometric", row: null, level: "error", message: "No score bands were found." });
    return bands;
  }

  const sorted = [...bands].sort((a, b) => a.minPct - b.minPct);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minPct <= sorted[i - 1].maxPct) {
      issues.push({
        tab: "Psychometric",
        row: sorted[i].row,
        level: "error",
        message: `Band "${sorted[i].label}" overlaps "${sorted[i - 1].label}".`,
      });
    }
  }
  if (sorted[0].minPct > 0) {
    issues.push({ tab: "Psychometric", row: null, level: "warning", message: `Score bands start at ${sorted[0].minPct}%, so a score below that has no analysis text.` });
  }
  if (sorted[sorted.length - 1].maxPct < 100) {
    issues.push({ tab: "Psychometric", row: null, level: "warning", message: `Score bands stop at ${sorted[sorted.length - 1].maxPct}%, so a score above that has no analysis text.` });
  }

  return sorted;
}

function parseSetup(workbook: XLSX.WorkBook, issues: RowIssue[]): ParsedQuestion[] {
  const grid = sheetGrid(workbook, "Setup_Questionnaire");
  if (!grid) return [];
  const headers = headerIndex(grid);
  const dataColumns = ["question_number", "question_en", "question_hi", "answer_type"]
    .map((name) => headers.get(name))
    .filter((index): index is number => index !== undefined);

  const questions: ParsedQuestion[] = [];
  const seen = new Map<number, number>();

  for (let i = 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rowNumber = i + 1;
    if (isBlankRow(row, dataColumns)) continue;

    const questionNumber = numberOrNull(row[headers.get("question_number") ?? -1]);
    if (questionNumber === null) {
      issues.push({ tab: "Setup_Questionnaire", row: rowNumber, level: "error", message: "question_number is missing or not a number." });
      continue;
    }
    if (seen.has(questionNumber)) {
      issues.push({
        tab: "Setup_Questionnaire",
        row: rowNumber,
        level: "error",
        message: `Question ${questionNumber} is already defined on row ${seen.get(questionNumber)}.`,
      });
      continue;
    }

    const prompt = parsePrompt(row, headers, "Setup_Questionnaire", rowNumber, issues);
    if (!prompt) continue;

    const rawType = cell(row[headers.get("answer_type") ?? -1]).toLowerCase();
    if (rawType && rawType !== "choice" && rawType !== "text") {
      issues.push({
        tab: "Setup_Questionnaire",
        row: rowNumber,
        level: "error",
        message: `answer_type must be "choice" or "text", got "${rawType}".`,
      });
      continue;
    }

    const options = parseOptions(row, headers, "Setup_Questionnaire", rowNumber, issues);
    const answerType: "choice" | "text" = rawType === "text" ? "text" : rawType === "choice" ? "choice" : options.length > 0 ? "choice" : "text";

    if (answerType === "choice" && options.length < 2) {
      issues.push({ tab: "Setup_Questionnaire", row: rowNumber, level: "error", message: 'A "choice" question needs at least two options.' });
      continue;
    }
    if (answerType === "text" && options.length > 0) {
      issues.push({ tab: "Setup_Questionnaire", row: rowNumber, level: "warning", message: 'A "text" question has options filled in; they will be ignored.' });
    }

    seen.set(questionNumber, rowNumber);
    questions.push({
      row: rowNumber,
      questionNumber,
      ...prompt,
      options: answerType === "text" ? [] : options,
      correctOption: null,
      trait: null,
      optionScores: null,
      answerType,
    });
  }

  return questions.sort((a, b) => a.questionNumber - b.questionNumber);
}

export function parseWorkbook(buffer: Buffer | ArrayBuffer): ParsedWorkbook {
  const issues: RowIssue[] = [];
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return {
      chapters: [],
      chapterTests: [],
      psychometric: [],
      analysisBands: [],
      setup: [],
      issues: [{ tab: "File", row: null, level: "error", message: "This file could not be read as an .xlsx workbook." }],
    };
  }

  // SheetJS is lenient -- it will happily "parse" a CSV or a text file into a workbook
  // rather than throwing, so a wrong file reaches here looking like an empty workbook.
  // Reporting that once is far clearer than four separate missing-tab errors.
  const presentTabs = REQUIRED_TABS.filter((tab) => workbook.Sheets[tab]);
  if (presentTabs.length === 0) {
    return {
      chapters: [],
      chapterTests: [],
      psychometric: [],
      analysisBands: [],
      setup: [],
      issues: [
        {
          tab: "File",
          row: null,
          level: "error",
          message:
            "This file could not be read as the NTS content template. Expected tabs named " +
            `${REQUIRED_TABS.join(", ")} -- found ${workbook.SheetNames.length ? workbook.SheetNames.join(", ") : "none"}.`,
        },
      ],
    };
  }
  for (const tab of REQUIRED_TABS) {
    if (!workbook.Sheets[tab]) {
      issues.push({ tab, row: null, level: "error", message: `The "${tab}" tab is missing from the workbook.` });
    }
  }

  const chapters = parseChapters(workbook, issues);
  const knownChapters = new Set(chapters.map((chapter) => chapter.chapterNumber));
  const chapterTests = parseChapterTests(workbook, knownChapters, issues);
  const psychometric = parsePsychometric(workbook, issues);
  const analysisBands = parseAnalysisBands(workbook, issues);
  const setup = parseSetup(workbook, issues);

  for (const chapter of chapters) {
    const count = chapterTests.filter((question) => question.chapterNumber === chapter.chapterNumber).length;
    if (count === 0) {
      issues.push({
        tab: "Chapter_Tests",
        row: null,
        level: "warning",
        message: `Chapter ${chapter.chapterNumber} has no test questions.`,
      });
    }
  }

  return { chapters, chapterTests, psychometric, analysisBands, setup, issues };
}

export function hasBlockingErrors(issues: RowIssue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}
