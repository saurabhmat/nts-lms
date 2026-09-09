import type { LearnerRecord } from "@/lib/reporting";

// One learner's full record. Shared by the master (/admin/learners/[userId]), their company
// admin (/team/learners/[userId]) and the learner themselves (/scorecard) -- the access
// decision happens in lib/reporting.ts, so all three render exactly the same facts.

const STATUS_STYLE: Record<string, string> = {
  complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  available: "bg-slate-50 text-slate-600 border-slate-200",
  locked: "bg-slate-50 text-slate-400 border-slate-200",
};

export function LearnerRecordView({
  record,
  showIdentity = true,
}: {
  record: LearnerRecord;
  showIdentity?: boolean;
}) {
  const { learner, columns, attempts } = record;

  return (
    <div className="space-y-6">
      {showIdentity && (
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{learner.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {learner.email}
            {learner.organizationName ? ` · ${learner.organizationName}` : " · Individual learner"}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Course progress"
          value={`${learner.chaptersComplete}/${columns.length}`}
          sub={`${Math.round(learner.completionPct)}% complete`}
        />
        <Stat
          label="Psychometric"
          value={learner.psychometricPct === null ? "—" : `${Math.round(learner.psychometricPct)}%`}
          sub={learner.bandLabel ?? "Not taken yet"}
        />
        <Stat
          label="Average test score"
          value={learner.averageScore === null ? "—" : learner.averageScore.toFixed(1)}
          sub={`Onboarding: ${learner.onboardingState.replace(/_/g, " ")}`}
        />
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chapters</h2>
        {columns.length === 0 ? (
          <p className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm">
            No chapters have been published yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {columns.map((column) => {
              const cell = learner.chapters[column.id];
              const status = cell?.status ?? "locked";
              return (
                <li key={column.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-5 flex-shrink-0 text-xs text-slate-400">{column.order}</span>
                    <span className="truncate text-slate-900">{column.titleEn}</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-3">
                    {cell?.testScore !== null && cell?.testScore !== undefined && (
                      <span className="text-slate-600">score {cell.testScore}</span>
                    )}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
                    >
                      {status.replace(/_/g, " ")}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Attempt history ({attempts.length})
        </h2>
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {attempts.map((attempt, index) => (
            <li
              key={`${attempt.chapterId ?? "psy"}-${attempt.attemptNo}-${index}`}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <span className="min-w-0 truncate text-slate-900">
                {attempt.chapterTitle ?? "Assessment"}
                <span className="ml-1.5 text-xs text-slate-400">attempt {attempt.attemptNo}</span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-3 text-slate-600">
                {attempt.score !== null && attempt.maxScore !== null && (
                  <span>
                    {attempt.score}/{attempt.maxScore}
                  </span>
                )}
                {attempt.passed !== null && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      attempt.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {attempt.passed ? "passed" : "failed"}
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  {attempt.submittedAt ? attempt.submittedAt.toLocaleDateString() : ""}
                </span>
              </span>
            </li>
          ))}
          {attempts.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No attempts yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  );
}
