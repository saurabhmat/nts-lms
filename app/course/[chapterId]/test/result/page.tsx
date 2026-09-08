import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getChapterForLearner } from "@/lib/course";
import { getSubmittedResult } from "@/lib/engine";
import { getSessionScope } from "@/lib/session";

export default async function TestResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ attempt?: string }>;
}) {
  const { chapterId } = await params;
  const { attempt: attemptId } = await searchParams;

  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  if (!attemptId) redirect(`/course/${chapterId}`);

  const detail = await getChapterForLearner(scope, chapterId);
  if (!detail) redirect("/course");

  // Read-only: getSubmittedResult never submits, so landing here directly cannot finish a
  // test the learner is still working through. It throws on an attempt belonging to someone
  // else, which is the right behaviour for the engine but must not surface as a 500 here.
  let result;
  try {
    result = await getSubmittedResult(scope, attemptId);
  } catch {
    redirect("/course");
  }
  if (!result) redirect(`/course/${chapterId}`);

  const percentage = Math.round(result.percentage);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div
        className={`rounded-xl border p-6 text-center shadow-sm ${
          result.passed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
        }`}
      >
        {result.passed ? (
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" strokeWidth={1.75} />
        ) : (
          <XCircle className="mx-auto h-9 w-9 text-amber-600" strokeWidth={1.75} />
        )}
        <h1
          className={`mt-3 text-lg font-semibold ${result.passed ? "text-emerald-900" : "text-amber-900"}`}
        >
          {result.passed ? "Chapter passed" : "Not passed this time"}
        </h1>
        <p className={`mt-1 text-sm ${result.passed ? "text-emerald-700" : "text-amber-800"}`}>
          You scored {result.score} out of {result.maxScore} ({percentage}%). The pass mark is{" "}
          {detail.passMarkPct}%.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href={`/course/${chapterId}`}
            className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Back to chapter
          </Link>
          <Link
            href="/course"
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            My course
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-900">Your answers</h2>
        <ol className="mt-3 space-y-3">
          {result.review.map((item) => (
            <li key={item.question.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-2">
                {item.isCorrect ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" strokeWidth={1.75} />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" strokeWidth={1.75} />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {item.question.order}. {item.question.promptEn}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.question.promptHi}</p>
                </div>
              </div>

              <ul className="mt-3 space-y-1 pl-6">
                {item.question.options.map((option) => {
                  const isCorrect = option.key === item.correctOption;
                  const isChosen = option.key === item.selectedOption;
                  return (
                    <li
                      key={option.key}
                      className={`text-sm ${
                        isCorrect
                          ? "font-medium text-emerald-700"
                          : isChosen
                            ? "text-red-600 line-through"
                            : "text-slate-500"
                      }`}
                    >
                      {option.key}. {option.en}
                      {isCorrect && " — correct answer"}
                      {isChosen && !isCorrect && " — your answer"}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
