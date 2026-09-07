import { Clock, Mail } from "lucide-react";
import { redirect } from "next/navigation";

import { inviteAdmins, listMasters, listPendingAdminInvitations } from "@/lib/admin/team";
import { getSessionScope } from "@/lib/session";

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

async function inviteAdminsAction(formData: FormData) {
  "use server";

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const emailsRaw = String(formData.get("emails") ?? "");
  const emails = emailsRaw
    .split(/[\n,]+/)
    .map((email) => email.trim())
    .filter(Boolean);

  const result = await inviteAdmins(scope, scope.userId, emails);
  const message =
    result.invited.length > 0
      ? `Invited ${result.invited.length}. Skipped ${result.skipped.length}.`
      : `No invitations sent. Skipped ${result.skipped.length}.`;

  redirect(`/admin/team?message=${encodeURIComponent(message)}`);
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const [masters, pendingInvitations] = await Promise.all([
    listMasters(scope),
    listPendingAdminInvitations(scope),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          Admins with full access across every company, same as your account.
        </p>
      </div>

      {message && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Admins ({masters.length})
        </h2>
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {masters.map((admin) => (
            <li key={admin.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="flex items-center gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600">
                  {initialsFor(admin.name)}
                </span>
                <span className="text-slate-900">
                  {admin.name} <span className="text-slate-400">· {admin.email}</span>
                </span>
              </span>
              {admin.id === scope.userId && (
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  You
                </span>
              )}
            </li>
          ))}
          {masters.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No admins yet.</li>
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
          Invite an admin
        </h2>
        <form
          action={inviteAdminsAction}
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
