import { Clock, Mail } from "lucide-react";
import { redirect } from "next/navigation";

import {
  getMyOrganization,
  inviteLearnersIntoMyOrganization,
  listPendingInvitationsForMyOrganization,
} from "@/lib/team/roster";
import { ProgressGrid } from "@/components/progress-grid";
import { getLearnerProgress, listChapterColumns } from "@/lib/reporting";
import { getSessionScope } from "@/lib/session";

async function inviteLearnersAction(formData: FormData) {
  "use server";

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const emailsRaw = String(formData.get("emails") ?? "");
  const emails = emailsRaw
    .split(/[\n,]+/)
    .map((email) => email.trim())
    .filter(Boolean);

  const result = await inviteLearnersIntoMyOrganization(scope, scope.userId, emails);
  const message =
    result.invited.length > 0
      ? `Invited ${result.invited.length}. Skipped ${result.skipped.length}.`
      : `No invitations sent. Skipped ${result.skipped.length}.`;

  redirect(`/team?message=${encodeURIComponent(message)}`);
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  // getLearnerProgress goes through the shared organisation-scope helper, so a manager can
  // only ever receive their own company's learners -- see docs/spec.md §2.
  const [organization, roster, pendingInvitations, columns] = await Promise.all([
    getMyOrganization(scope),
    getLearnerProgress(scope),
    listPendingInvitationsForMyOrganization(scope),
    listChapterColumns(),
  ]);

  const onboarded = roster.filter((learner) => learner.onboardingState === "complete").length;
  const averageCompletion =
    roster.length > 0 ? roster.reduce((total, row) => total + row.completionPct, 0) / roster.length : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {organization?.name ?? "Your team"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {roster.length} learner{roster.length === 1 ? "" : "s"} · {onboarded} onboarded ·{" "}
          {Math.round(averageCompletion)}% average completion
        </p>
      </div>

      {message && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Learners ({roster.length})
        </h2>
        <div className="mt-2">
          <ProgressGrid
            rows={roster}
            columns={columns}
            learnerHrefPrefix="/team/learners"
            emptyMessage="No learners yet. Invite them below."
          />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pending invitations ({pendingInvitations.length})
        </h2>
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {pendingInvitations.map((invitation) => (
            <li key={invitation.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="flex items-center gap-3 text-slate-900">
                <Mail className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
                {invitation.email}
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                expires {invitation.expiresAt.toLocaleDateString()}
              </span>
            </li>
          ))}
          {pendingInvitations.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              No pending invitations.
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Invite learners
        </h2>
        <form
          action={inviteLearnersAction}
          className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <textarea
            name="emails"
            required
            rows={4}
            placeholder="One email per line, or comma-separated"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Send invitations
          </button>
        </form>
      </section>

    </div>
  );
}
