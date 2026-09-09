import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { getSessionScope } from "@/lib/session";
import { signOutAction } from "@/lib/session-actions";
import { getMyOrganization } from "@/lib/team/roster";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  if (scope.role !== "company_admin") redirect("/403");

  // The company name belongs in the banner, not just on the page: a manager should always be
  // able to see which organisation they are looking at, on every screen.
  const organization = await getMyOrganization(scope);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              N
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-900">
                {organization?.name ?? "NTS LMS"}
              </p>
              <p className="text-xs text-slate-500">Team dashboard · NTS LMS</p>
            </div>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="min-w-0 flex-1 bg-slate-50 px-8 py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
