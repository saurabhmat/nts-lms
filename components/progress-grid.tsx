import Link from "next/link";

import type { ChapterColumn, LearnerProgressRow } from "@/lib/reporting";

// Learners down, chapters across (docs/spec.md §5). Shared by the master's per-company view,
// the company admin's team view and the individual-learner list, so all three read the same way.

const CELL: Record<string, { className: string; label: string }> = {
  complete: { className: "bg-emerald-500 text-white", label: "✓" },
  in_progress: { className: "bg-amber-400 text-amber-950", label: "•" },
  available: { className: "bg-slate-200 text-slate-500", label: "–" },
  locked: { className: "bg-slate-100 text-slate-300", label: "" },
};

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function ProgressGrid({
  rows,
  columns,
  learnerHrefPrefix,
  showCompany = false,
  emptyMessage = "No learners yet.",
}: {
  rows: LearnerProgressRow[];
  columns: ChapterColumn[];
  learnerHrefPrefix?: string;
  showCompany?: boolean;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            <th className="px-4 py-2.5 font-medium text-slate-600">Learner</th>
            {showCompany && <th className="px-3 py-2.5 font-medium text-slate-600">Company</th>}
            <th className="px-3 py-2.5 font-medium text-slate-600">Onboarding</th>
            <th className="px-3 py-2.5 font-medium text-slate-600">Psychometric</th>
            {columns.map((column) => (
              <th
                key={column.id}
                title={column.titleEn}
                className="w-9 px-1 py-2.5 text-center font-medium text-slate-500"
              >
                {column.order}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right font-medium text-slate-600">Progress</th>
            <th className="px-4 py-2.5 text-right font-medium text-slate-600">Avg</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">
                    {initialsFor(row.name)}
                  </span>
                  <span className="min-w-0">
                    {learnerHrefPrefix ? (
                      <Link
                        href={`${learnerHrefPrefix}/${row.id}`}
                        className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-900">{row.name}</span>
                    )}
                    <span className="block truncate text-xs text-slate-400">{row.email}</span>
                  </span>
                </span>
              </td>

              {showCompany && (
                <td className="px-3 py-2.5 text-slate-600">{row.organizationName ?? "Individual"}</td>
              )}

              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    row.onboardingState === "complete"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {row.onboardingState.replace(/_/g, " ")}
                </span>
              </td>

              <td className="px-3 py-2.5 text-slate-600">
                {row.psychometricPct === null ? (
                  <span className="text-slate-300">—</span>
                ) : (
                  <>
                    {Math.round(row.psychometricPct)}%
                    {row.bandLabel && <span className="ml-1 text-xs text-slate-400">{row.bandLabel}</span>}
                  </>
                )}
              </td>

              {columns.map((column) => {
                const cell = row.chapters[column.id];
                const style = CELL[cell?.status ?? "locked"];
                return (
                  <td key={column.id} className="px-1 py-2.5 text-center">
                    <span
                      title={`${column.titleEn}${cell?.testScore !== null && cell?.testScore !== undefined ? ` — score ${cell.testScore}` : ""}`}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded text-[11px] font-semibold ${style.className}`}
                    >
                      {cell?.testScore ?? style.label}
                    </span>
                  </td>
                );
              })}

              <td className="px-3 py-2.5 text-right">
                <span className="text-slate-900">
                  {row.chaptersComplete}/{columns.length}
                </span>
                <span className="ml-1 text-xs text-slate-400">{Math.round(row.completionPct)}%</span>
              </td>

              <td className="px-4 py-2.5 text-right text-slate-900">
                {row.averageScore === null ? (
                  <span className="text-slate-300">—</span>
                ) : (
                  row.averageScore.toFixed(1)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
