import { LogOut } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getSessionScope } from "@/lib/session";
import { signOutAction } from "@/lib/session-actions";

// Onboarding belongs to learners. A master or company admin has no onboarding state to
// complete, so they are sent to their own landing page rather than through this funnel.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  if (scope.role === "master") redirect("/admin");
  if (scope.role === "company_admin") redirect("/team");

  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              N
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">NTS Sales Mastery</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-400 sm:inline">{session?.user.name}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
