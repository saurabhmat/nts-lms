import { BookOpen, CheckCircle2, ChevronRight, CircleDashed, FileText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listChaptersForAdmin } from "@/lib/chapters";
import { getSessionScope } from "@/lib/session";

export default async function CoursePage() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const chapters = await listChaptersForAdmin(scope);
  const published = chapters.filter((chapter) => chapter.isPublished).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Course</h1>
        <p className="mt-1 text-sm text-slate-500">
          {chapters.length} chapter{chapters.length === 1 ? "" : "s"} · {published} published
        </p>
      </div>

      {chapters.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium text-slate-900">No chapters yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Chapters are created by importing the content workbook.
          </p>
          <Link
            href="/admin/import"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Go to import
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {chapters.map((chapter) => (
              <li key={chapter.id}>
                <Link
                  href={`/admin/course/${chapter.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-semibold tabular-nums text-slate-600">
                    {chapter.order}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{chapter.titleEn}</span>
                    <span className="block truncate text-xs text-slate-500">{chapter.titleHi}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="tabular-nums">{chapter.questionCount} questions</span>
                    <span className={`flex items-center gap-1 ${chapter.notesFileKey ? "text-slate-600" : "text-slate-300"}`}>
                      <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Notes
                    </span>
                    {chapter.isPublished ? (
                      <span className="flex items-center gap-1 font-medium text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Published
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400">
                        <CircleDashed className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Draft
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
