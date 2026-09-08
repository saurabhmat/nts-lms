import { ArrowLeft, CheckCircle2, ClipboardList, Download, FileText, PlayCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getChapterForLearner, getLearnerNotesUrl } from "@/lib/course";
import { isR2Configured } from "@/lib/r2";
import { getSessionScope } from "@/lib/session";

export default async function ChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { chapterId } = await params;
  const { error } = await searchParams;

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const detail = await getChapterForLearner(scope, chapterId);
  if (!detail) redirect("/course");
  if (detail.chapter.status === "locked") redirect("/course");

  // Only presign when storage is actually configured, so a chapter still opens (without a
  // download link) on an environment where R2 credentials are not set.
  const notesUrl = detail.notesFileKey && isR2Configured() ? await getLearnerNotesUrl(scope, chapterId) : null;

  const passed = detail.attempts.some((attempt) => attempt.passed);
  const used = detail.attempts.length;
  const best = detail.attempts.reduce<number | null>(
    (acc, attempt) => (attempt.score === null ? acc : Math.max(acc ?? 0, attempt.score)),
    null,
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/course"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          My course
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
          Chapter {detail.chapter.order}: {detail.chapter.titleEn}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">{detail.chapter.titleHi}</p>
      </div>

      {error && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
      )}

      {detail.chapter.summaryEn && (
        <p className="text-sm leading-relaxed text-slate-700">{detail.chapter.summaryEn}</p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FileText className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
          Chapter notes
        </h2>
        {notesUrl ? (
          <>
            <p className="mt-1 text-sm text-slate-500">Read the notes before taking the test.</p>
            <a
              href={notesUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
              Open notes
            </a>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            {detail.notesFileKey
              ? "Notes are temporarily unavailable. Please try again shortly."
              : "No notes have been uploaded for this chapter yet."}
          </p>
        )}
      </section>

      {detail.deliverableEn && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ClipboardList className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
            Your deliverable
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
            {detail.deliverableEn}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Complete this in your own time. It is not submitted through the platform.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Chapter test</h2>

        {detail.setId === null || detail.chapter.questionCount === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No test has been set for this chapter yet.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">
              {detail.chapter.questionCount} questions · pass mark {detail.passMarkPct}%
              {best !== null && ` · best score ${best}/${detail.chapter.questionCount}`}
            </p>

            {passed ? (
              <p className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
                You have passed this chapter.
              </p>
            ) : detail.attemptsRemaining === 0 ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                You have used all {used} attempts for this test. Speak to your trainer.
              </p>
            ) : (
              <>
                <Link
                  href={`/course/${chapterId}/test`}
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <PlayCircle className="h-4 w-4" strokeWidth={1.75} />
                  {used === 0 ? "Take test" : "Retake test"}
                </Link>
                <p className="mt-2 text-xs text-slate-400">
                  {detail.attemptsRemaining} attempt{detail.attemptsRemaining === 1 ? "" : "s"} remaining
                </p>
              </>
            )}

            {detail.attempts.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3">
                {detail.attempts
                  .filter((attempt) => attempt.status === "submitted")
                  .map((attempt) => (
                    <li key={attempt.id} className="flex items-center justify-between text-xs text-slate-500">
                      <span>Attempt {attempt.attemptNo}</span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums">
                          {attempt.score}/{attempt.maxScore}
                        </span>
                        <span className={attempt.passed ? "font-medium text-emerald-600" : "text-slate-400"}>
                          {attempt.passed ? "Passed" : "Not passed"}
                        </span>
                        <Link
                          href={`/course/${chapterId}/test/result?attempt=${attempt.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          Review
                        </Link>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
