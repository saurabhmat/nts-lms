import { redirect } from "next/navigation";

import { ProgressGrid } from "@/components/progress-grid";
import { getIndividualLearners, getLearnerProgress, listChapterColumns } from "@/lib/reporting";
import { getSessionScope } from "@/lib/session";

// docs/spec.md §5: individual learners are those with no organisation. The whole-platform grid
// is shown underneath, so the master can see everyone in one place.
export default async function AdminLearnersPage() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const [columns, individuals, everyone] = await Promise.all([
    listChapterColumns(),
    getIndividualLearners(scope),
    getLearnerProgress(scope),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Learners</h1>
        <p className="mt-1 text-sm text-slate-500">
          {everyone.length} learner{everyone.length === 1 ? "" : "s"} across the platform.
        </p>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Individual learners ({individuals.length})
        </h2>
        <p className="mb-2 mt-1 text-xs text-slate-500">Learners who do not belong to any company.</p>
        <ProgressGrid
          rows={individuals}
          columns={columns}
          learnerHrefPrefix="/admin/learners"
          emptyMessage="No individual learners."
        />
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          All learners ({everyone.length})
        </h2>
        <div className="mt-2">
          <ProgressGrid
            rows={everyone}
            columns={columns}
            learnerHrefPrefix="/admin/learners"
            showCompany
            emptyMessage="No learners yet. Invite them from a company page."
          />
        </div>
      </section>
    </div>
  );
}
