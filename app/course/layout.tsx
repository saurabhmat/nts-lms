import { GraduationCap, LogOut } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getSessionScope } from "@/lib/session";
import { signOutAction } from "@/lib/session-actions";

export default async function CourseLayout({ children }: { children: React.ReactNode }) {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  // docs/spec.md §5 also gates these routes on `onboarding_state = complete`, redirecting
  // an unfinished learner to /onboarding/*. That redirect is deliberately not wired yet:
  // the onboarding funnel is spec §8 step 5 and does not exist, so enforcing the gate now
  // would make the course unreachable for every learner. It lands with those routes.

  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/course" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
              N
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">NTS Sales Mastery</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/course"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              <GraduationCap className="h-4 w-4" strokeWidth={1.75} />
              My course
            </Link>
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
