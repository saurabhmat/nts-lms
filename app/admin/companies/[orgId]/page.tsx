import { ArrowLeft, Clock, Mail } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCompanyDetail,
  inviteCompanyOwner,
  inviteLearners,
  setMemberApplicationRole,
} from "@/lib/admin/companies";
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

async function inviteCompanyOwnerAction(organizationId: string, formData: FormData) {
  "use server";

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const email = String(formData.get("ownerEmail") ?? "").trim();
  if (!email) redirect(`/admin/companies/${organizationId}`);

  const result = await inviteCompanyOwner(scope, organizationId, scope.userId, email);
  const message =
    result.invited.length > 0
      ? `Invited ${result.invited[0]} as company admin.`
      : `Not invited: ${result.skipped[0]?.reason ?? "unknown reason"}.`;

  redirect(`/admin/companies/${organizationId}?message=${encodeURIComponent(message)}`);
}

async function toggleMemberRoleAction(organizationId: string, formData: FormData) {
  "use server";

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const userId = String(formData.get("userId") ?? "");
  const nextRole = String(formData.get("nextRole") ?? "") as "learner" | "company_admin";

  await setMemberApplicationRole(scope, organizationId, userId, nextRole);

  redirect(`/admin/companies/${organizationId}`);
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
  const boundInviteOwnerAction = inviteCompanyOwnerAction.bind(null, orgId);
  const boundToggleRoleAction = toggleMemberRoleAction.bind(null, orgId);

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
              <span className="flex items-center gap-3">
                <span className="text-slate-500">{member.onboardingState}</span>
                {member.applicationRole === "company_admin" ? (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-600">
                    Company admin
                  </span>
                ) : null}
                <form action={boundToggleRoleAction}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <input
                    type="hidden"
                    name="nextRole"
                    value={member.applicationRole === "company_admin" ? "learner" : "company_admin"}
                  />
                  <button
                    type="submit"
                    className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700"
                  >
                    {member.applicationRole === "company_admin" ? "Revoke admin" : "Make admin"}
                  </button>
                </form>
              </span>
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
                {invitation.role === "company_admin" && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-600">
                    Company admin
                  </span>
                )}
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
          Invite company owner
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          The owner gets full access to this company&apos;s data only, and can invite their own
          learners from their Team view.
        </p>
        <form
          action={boundInviteOwnerAction}
          className="mt-2 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="min-w-64 flex-1">
            <label htmlFor="ownerEmail" className="block text-xs font-medium text-slate-600">
              Email
            </label>
            <input
              id="ownerEmail"
              name="ownerEmail"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Send invitation
          </button>
        </form>
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
