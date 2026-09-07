import { notFound, redirect } from "next/navigation";

import { getCompanyDetail, inviteLearners } from "@/lib/admin/companies";
import { getSessionScope } from "@/lib/session";

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
        <h1 className="text-xl font-semibold text-gray-900">{organization.name}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {organization.slug} · {organization.status}
          {organization.seatLimit ? ` · seat limit ${organization.seatLimit}` : ""}
        </p>
      </div>

      {message && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-900">Learners ({roster.length})</h2>
        <ul className="mt-2 divide-y divide-gray-200 rounded-md border border-gray-200">
          {roster.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span>
                {member.name} · {member.email}
              </span>
              <span className="text-gray-500">{member.onboardingState}</span>
            </li>
          ))}
          {roster.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-500">No learners yet.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900">
          Pending invitations ({pendingInvitations.length})
        </h2>
        <ul className="mt-2 divide-y divide-gray-200 rounded-md border border-gray-200">
          {pendingInvitations.map((invitation) => (
            <li
              key={invitation.id}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span>{invitation.email}</span>
              <span className="text-gray-500">
                expires {invitation.expiresAt.toLocaleDateString()}
              </span>
            </li>
          ))}
          {pendingInvitations.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-500">
              No pending invitations.
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900">Bulk-add learners</h2>
        <form action={boundInviteAction} className="mt-2 space-y-3">
          <textarea
            name="emails"
            required
            rows={4}
            placeholder="One email per line, or comma-separated"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Send invitations
          </button>
        </form>
      </section>
    </div>
  );
}
