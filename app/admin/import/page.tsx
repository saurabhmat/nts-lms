import { redirect } from "next/navigation";

import { getImportedContentSummary } from "@/lib/import/commit";
import { getSessionScope } from "@/lib/session";

import { ImportClient } from "./import-client";

export default async function ImportPage() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const current = await getImportedContentSummary();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Import content</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload the filled-in <span className="font-medium">NTS_LMS_Content_Template.xlsx</span>. Chapters, tests, the
          psychometric assessment and the setup questionnaire all load from this one file.
        </p>
      </div>

      {current ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-900">Currently loaded</p>
          <p className="mt-1 text-sm text-slate-500">
            {current.chapters.length} chapter{current.chapters.length === 1 ? "" : "s"} · {current.questionCount}{" "}
            question{current.questionCount === 1 ? "" : "s"} · {current.bandCount} analysis band
            {current.bandCount === 1 ? "" : "s"}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Re-importing replaces question content in place. Uploaded chapter notes and published status are kept.
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No content has been imported yet.
        </p>
      )}

      <ImportClient />
    </div>
  );
}
