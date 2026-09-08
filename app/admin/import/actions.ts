"use server";

import { redirect } from "next/navigation";

import { commitWorkbook, countResponsesAtRisk, type CommitSummary } from "@/lib/import/commit";
import { hasBlockingErrors, parseWorkbook, type ParsedWorkbook } from "@/lib/import/parse";
import { getSessionScope } from "@/lib/session";

export type PreviewResult =
  | { ok: true; preview: ParsedWorkbook; blocked: boolean; responsesAtRisk: number }
  | { ok: false; message: string };

export type CommitResult =
  | { ok: true; summary: CommitSummary }
  | { ok: false; message: string };

const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;

async function readWorkbook(formData: FormData): Promise<Buffer | string> {
  const file = formData.get("workbook");
  if (!(file instanceof File) || file.size === 0) {
    return "Choose an .xlsx file to upload.";
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return `Expected an .xlsx workbook, got "${file.name}".`;
  }
  if (file.size > MAX_WORKBOOK_BYTES) {
    return "That file is larger than 10 MB. Check it is the content workbook.";
  }
  return Buffer.from(await file.arrayBuffer());
}

export async function previewImportAction(formData: FormData): Promise<PreviewResult> {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  if (scope.role !== "master") return { ok: false, message: "Only the trainer can import content." };

  const workbook = await readWorkbook(formData);
  if (typeof workbook === "string") return { ok: false, message: workbook };

  const preview = parseWorkbook(workbook);
  return {
    ok: true,
    preview,
    blocked: hasBlockingErrors(preview.issues),
    responsesAtRisk: await countResponsesAtRisk(),
  };
}

// The file is re-sent and re-parsed rather than cached between the two steps: parsing is
// deterministic, so this guarantees what gets committed is exactly what was previewed,
// with no server-side session state to expire or leak between admins.
export async function commitImportAction(formData: FormData): Promise<CommitResult> {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  if (scope.role !== "master") return { ok: false, message: "Only the trainer can import content." };

  const workbook = await readWorkbook(formData);
  if (typeof workbook === "string") return { ok: false, message: workbook };

  const parsed = parseWorkbook(workbook);
  try {
    const summary = await commitWorkbook(scope, parsed, {
      confirmDestructive: formData.get("confirmDestructive") === "yes",
    });
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
