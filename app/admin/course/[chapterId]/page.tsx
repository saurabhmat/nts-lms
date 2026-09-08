import { ArrowLeft, Download, FileText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getChapterForAdmin,
  getChapterNotesUrl,
  setChapterPublished,
  updateChapterText,
  uploadChapterNotes,
} from "@/lib/chapters";
import { isR2Configured } from "@/lib/r2";
import { getSessionScope } from "@/lib/session";

function backTo(chapterId: string, message: string, key: "error" | "notice") {
  redirect(`/admin/course/${chapterId}?${key}=${encodeURIComponent(message)}`);
}

async function saveTextAction(formData: FormData) {
  "use server";

  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  const chapterId = String(formData.get("chapterId") ?? "");

  try {
    await updateChapterText(scope, chapterId, {
      titleEn: String(formData.get("titleEn") ?? ""),
      titleHi: String(formData.get("titleHi") ?? ""),
      summaryEn: String(formData.get("summaryEn") ?? ""),
      deliverableEn: String(formData.get("deliverableEn") ?? ""),
    });
  } catch (error) {
    backTo(chapterId, (error as Error).message, "error");
  }
  backTo(chapterId, "Chapter saved", "notice");
}

async function uploadNotesAction(formData: FormData) {
  "use server";

  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  const chapterId = String(formData.get("chapterId") ?? "");
  const file = formData.get("notes");

  if (!(file instanceof File)) backTo(chapterId, "Choose a file to upload", "error");

  try {
    await uploadChapterNotes(scope, chapterId, file as File);
  } catch (error) {
    backTo(chapterId, (error as Error).message, "error");
  }
  backTo(chapterId, "Notes uploaded", "notice");
}

async function togglePublishAction(formData: FormData) {
  "use server";

  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  const chapterId = String(formData.get("chapterId") ?? "");
  const publish = formData.get("publish") === "yes";

  try {
    await setChapterPublished(scope, chapterId, publish);
  } catch (error) {
    backTo(chapterId, (error as Error).message, "error");
  }
  backTo(chapterId, publish ? "Chapter published" : "Chapter unpublished", "notice");
}

export default async function ChapterEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { chapterId } = await params;
  const { error, notice } = await searchParams;

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const result = await getChapterForAdmin(scope, chapterId);
  if (!result) redirect("/admin/course");

  const { chapter, questions } = result;
  const notesUrl = chapter.notesFileKey ? await getChapterNotesUrl(scope, chapterId) : null;
  const storageReady = isR2Configured();

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500";
  const labelClass = "block text-xs font-medium text-slate-600";

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/course"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Course
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Chapter {chapter.order}: {chapter.titleEn}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{chapter.titleHi}</p>
          </div>
          <form action={togglePublishAction}>
            <input type="hidden" name="chapterId" value={chapter.id} />
            <input type="hidden" name="publish" value={chapter.isPublished ? "no" : "yes"} />
            <button
              type="submit"
              className={`rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition-colors ${
                chapter.isPublished
                  ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {chapter.isPublished ? "Unpublish" : "Publish"}
            </button>
          </form>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      )}

      <form action={saveTextAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="chapterId" value={chapter.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="titleEn" className={labelClass}>Title (English)</label>
            <input id="titleEn" name="titleEn" required defaultValue={chapter.titleEn} className={inputClass} />
          </div>
          <div>
            <label htmlFor="titleHi" className={labelClass}>Title (Hindi)</label>
            <input id="titleHi" name="titleHi" required defaultValue={chapter.titleHi} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="summaryEn" className={labelClass}>Summary</label>
          <textarea id="summaryEn" name="summaryEn" rows={3} defaultValue={chapter.summaryEn} className={inputClass} />
        </div>
        <div>
          <label htmlFor="deliverableEn" className={labelClass}>Deliverable brief</label>
          <textarea id="deliverableEn" name="deliverableEn" rows={3} defaultValue={chapter.deliverableEn} className={inputClass} />
        </div>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          Save changes
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-900">Chapter notes</p>
        {chapter.notesFileKey ? (
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <FileText className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
            A notes file is uploaded.
            {notesUrl && (
              <a
                href={notesUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No notes uploaded yet. A chapter cannot be published without them.</p>
        )}

        {storageReady ? (
          <form action={uploadNotesAction} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="chapterId" value={chapter.id} />
            <input
              type="file"
              name="notes"
              accept=".pdf,.doc,.docx"
              required
              className="text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              {chapter.notesFileKey ? "Replace notes" : "Upload notes"}
            </button>
          </form>
        ) : (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            File storage is not configured, so notes cannot be uploaded yet. Set the R2 variables and restart.
          </p>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-slate-900">
          Test questions <span className="font-normal text-slate-500">({questions.length})</span>
        </p>
        {questions.length === 0 ? (
          <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No questions for this chapter. They load from the content workbook.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {questions.map((question) => (
              <li key={question.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-slate-900">
                  {question.order}. {question.promptEn}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">{question.promptHi}</p>
                <ul className="mt-2 space-y-1">
                  {question.options.map((option) => (
                    <li
                      key={option.key}
                      className={`text-sm ${
                        option.key === question.correctOption ? "font-medium text-emerald-700" : "text-slate-600"
                      }`}
                    >
                      {option.key}. {option.en} — {option.hi}
                      {option.key === question.correctOption && " ✓"}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
