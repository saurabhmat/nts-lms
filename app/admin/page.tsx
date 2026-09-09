import { Building2, GraduationCap, TrendingUp, UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCompanyOverviews, getIndividualLearners, getPlatformSummary } from "@/lib/reporting";
import { getSessionScope } from "@/lib/session";

// The master's landing page (docs/spec.md §5): every organisation, their learner counts and
// completion rates, plus the individual learners who belong to no company.
export default async function AdminDashboard() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const [summary, companies, individuals] = await Promise.all([
    getPlatformSummary(scope),
    getCompanyOverviews(scope),
    getIndividualLearners(scope),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Every company and learner on the platform.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={Building2} label="Companies" value={String(summary.companyCount)} />
        <Stat icon={GraduationCap} label="Learners" value={String(summary.learnerCount)} />
        <Stat icon={UserRound} label="Individual" value={String(summary.individualCount)} />
        <Stat icon={TrendingUp} label="Avg completion" value={`${Math.round(summary.completionPct)}%`} />
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Companies ({companies.length})
          </h2>
          <Link href="/admin/companies" className="text-sm font-medium text-blue-600 hover:underline">
            Manage companies
          </Link>
        </div>

        {companies.length === 0 ? (
          <p className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            No companies yet.{" "}
            <Link href="/admin/companies" className="font-medium text-blue-600 hover:underline">
              Onboard the first one
            </Link>
            .
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-slate-600">Company</th>
                  <th className="px-3 py-2.5 font-medium text-slate-600">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600">Managers</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600">Learners</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600">Onboarded</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600">Completion</th>
                  <th className="px-4 py-2.5 text-right font-medium text-slate-600">Avg score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((company) => (
                  <tr key={company.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/companies/${company.id}`}
                        className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                      >
                        {company.name}
                      </Link>
                      <span className="block text-xs text-slate-400">{company.slug}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          company.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {company.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{company.adminCount}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700">
                      {company.learnerCount}
                      {company.seatLimit ? (
                        <span className="text-xs text-slate-400"> / {company.seatLimit}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700">{company.onboardedCount}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                          <span
                            className="block h-full rounded-full bg-blue-600"
                            style={{ width: `${Math.min(company.completionPct, 100)}%` }}
                          />
                        </span>
                        <span className="w-9 text-right text-slate-700">
                          {Math.round(company.completionPct)}%
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {company.averageScore === null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        company.averageScore.toFixed(1)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Individual learners ({individuals.length})
          </h2>
          {individuals.length > 0 && (
            <Link href="/admin/learners" className="text-sm font-medium text-blue-600 hover:underline">
              View all
            </Link>
          )}
        </div>
        <p className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {individuals.length === 0
            ? "No individual learners — everyone belongs to a company."
            : `${individuals.length} learner${individuals.length === 1 ? "" : "s"} with no company.`}
        </p>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
