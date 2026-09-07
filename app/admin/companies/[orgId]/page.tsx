import { ArrowLeft, Clock, Mail } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCompanyDetail, inviteLearners } from "@/lib/admin/companies";
import { getSessionScope } from "@/lib/session";

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

async function inviteLearnersAction(organizationId: string, formData: FormData) {
  "use server";

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const emailsRaw = String(formData.get("emails") ?? "");
  const emails = emailsRaw
    .split(/[\n,]+/)
    .map((email) => email.trim())
    .filter(Boolean);

  const result = await inviteLearners(scope, organizationId, scope.userId, emails);
  const message =
    result.invited.length > 0
      ? `Invited ${result.invited.length}. Skipped ${result.skipped.length}.`
      : `No invitations sent. Skipped ${result.skipped.length}.`;

  redirect(`/admin/companies/${organizationId}?message=${encodeURIComponent(message)}`);
}

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { orgId } = await params;
  const { message } = await searchParams;
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const detail = await getCompanyDetail(scope, orgId);
  if (!detail) notFound();

  const { organization, roster, pendingInvitations } = detail;
  const boundInviteAction = inviteLearnersAction.bind(null, orgId);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/companies"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-blue-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Companies
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {organization.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {organization.slug} · {organization.status}
          {organization.seatLimit ? ` · seat limit ${organization.seatLimit}` : ""}
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
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {roster.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">
                  {initialsFor(member.name)}
                </span>
                <span className="text-slate-900">
                  {member.name} <span className="text-slate-400">· {member.email}</span>
                </span>
              </span>
              <span className="text-slate-500">{member.onboardingState}</span>
            </li>
          ))}
          {roster.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No learners yet.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pending invitations ({pendingInvitations.length})
        </h2>
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {pendingInvitations.map((invitation) => (
            <li
              key={invitation.id}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
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
          Bulk-add learners
        </h2>
        <form
          action={boundInviteAction}
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
