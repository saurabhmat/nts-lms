import { BarChart3, GraduationCap, LogOut } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/lib/session-actions";

// The shell every signed-in learner screen shares (/course/* and /scorecard), so the header and
// navigation cannot drift apart between them.
export function LearnerShell({
  userName,
  children,
}: {
  userName: string | undefined;
  children: React.ReactNode;
}) {
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
            <Link
              href="/scorecard"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              <BarChart3 className="h-4 w-4" strokeWidth={1.75} />
              My scorecard
            </Link>
            <span className="hidden text-sm text-slate-400 sm:inline">{userName}</span>
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
