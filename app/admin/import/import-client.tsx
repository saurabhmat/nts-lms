"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { RowIssue } from "@/lib/import/parse";

import { commitImportAction, previewImportAction, type CommitResult, type PreviewResult } from "./actions";

function IssueList({ issues, level }: { issues: RowIssue[]; level: "error" | "warning" }) {
  const filtered = issues.filter((issue) => issue.level === level);
  if (filtered.length === 0) return null;

  const isError = level === "error";
  return (
    <div
      className={`rounded-lg border p-4 ${isError ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
    >
      <p className={`flex items-center gap-2 text-sm font-semibold ${isError ? "text-red-800" : "text-amber-800"}`}>
        {isError ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {filtered.length} {isError ? "error" : "warning"}
        {filtered.length === 1 ? "" : "s"}
      </p>
      <ul className={`mt-2 max-h-64 space-y-1 overflow-y-auto text-sm ${isError ? "text-red-700" : "text-amber-700"}`}>
        {filtered.map((issue, index) => (
          <li key={index} className="flex gap-2">
            <span className="font-mono text-xs opacity-70">
              {issue.tab}
              {issue.row !== null ? `:${issue.row}` : ""}
            </span>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

export function ImportClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const [pending, setPending] = useState<"preview" | "commit" | null>(null);

  function reset() {
    setPreview(null);
    setCommitted(null);
  }

  async function onPreview(formData: FormData) {
    setPending("preview");
    reset();
    try {
      setPreview(await previewImportAction(formData));
    } finally {
      setPending(null);
    }
  }

  async function onCommit() {
    if (!file || !preview?.ok) return;
    setPending("commit");
    try {
      const formData = new FormData();
      formData.set("workbook", file);
      if (preview.responsesAtRisk > 0) formData.set("confirmDestructive", "yes");
      const result = await commitImportAction(formData);
      setCommitted(result);
      if (result.ok) {
        setPreview(null);
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <form action={onPreview} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="workbook" className="block text-xs font-medium text-slate-600">
          Content workbook (.xlsx)
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            id="workbook"
            name="workbook"
            type="file"
            accept=".xlsx"
            required
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              reset();
            }}
            className="text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <button
            type="submit"
            disabled={pending !== null}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {pending === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Check file
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Nothing is saved until you review the preview and confirm.
        </p>
      </form>

      {committed && !committed.ok && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{committed.message}</p>
      )}

      {committed?.ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Import complete
          </p>
          <ul className="mt-2 space-y-0.5 text-sm text-emerald-700">
            <li>{committed.summary.chaptersCreated} chapters created, {committed.summary.chaptersUpdated} updated</li>
            <li>{committed.summary.chapterTestQuestions} chapter-test questions</li>
            <li>{committed.summary.psychometricQuestions} psychometric questions</li>
            <li>{committed.summary.setupQuestions} setup questions</li>
            <li>{committed.summary.analysisBands} analysis bands</li>
          </ul>
        </div>
      )}

      {preview && !preview.ok && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{preview.message}</p>
      )}

      {preview?.ok && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileSpreadsheet className="h-4 w-4 text-slate-400" />
            Preview
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Chapters" value={preview.preview.chapters.length} />
            <Stat label="Test questions" value={preview.preview.chapterTests.length} />
            <Stat label="Psychometric" value={preview.preview.psychometric.length} />
            <Stat label="Setup" value={preview.preview.setup.length} />
            <Stat label="Bands" value={preview.preview.analysisBands.length} />
          </div>

          <IssueList issues={preview.preview.issues} level="error" />
          <IssueList issues={preview.preview.issues} level="warning" />

          {preview.preview.chapters.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Title (EN)</th>
                    <th className="px-4 py-2 font-medium">Title (HI)</th>
                    <th className="px-4 py-2 font-medium">Questions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.preview.chapters.map((chapter) => (
                    <tr key={chapter.chapterNumber}>
                      <td className="px-4 py-2 tabular-nums text-slate-500">{chapter.chapterNumber}</td>
                      <td className="px-4 py-2 text-slate-900">{chapter.titleEn}</td>
                      <td className="px-4 py-2 text-slate-700">{chapter.titleHi}</td>
                      <td className="px-4 py-2 tabular-nums text-slate-500">
                        {preview.preview.chapterTests.filter((q) => q.chapterNumber === chapter.chapterNumber).length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.blocked ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Fix the errors above and upload the file again. Nothing has been saved.
            </p>
          ) : (
            <div className="space-y-3">
              {preview.responsesAtRisk > 0 && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <strong>Warning:</strong> {preview.responsesAtRisk} learner answer
                  {preview.responsesAtRisk === 1 ? "" : "s"} already recorded against the current questions will be
                  permanently deleted by this import.
                </p>
              )}
              <button
                type="button"
                onClick={onCommit}
                disabled={pending !== null}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending === "commit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {preview.responsesAtRisk > 0 ? "Import anyway and delete answers" : "Import this content"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
