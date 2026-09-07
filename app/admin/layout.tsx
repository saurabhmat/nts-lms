import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { auth } from "@/lib/auth";
import { getSessionScope } from "@/lib/session";
import { signOutAction } from "@/lib/session-actions";

import { AdminNav } from "./nav";

function initialsFor(name: string | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  if (scope.role !== "master") redirect("/403");

  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-64 flex-shrink-0 flex-col bg-slate-900">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            N
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-white">NTS LMS</p>
            <p className="text-xs text-slate-400">Admin Console</p>
          </div>
        </div>

        <div className="mx-5 border-t border-slate-800" />

        <AdminNav />

        <div className="border-t border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
              {initialsFor(session?.user.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{session?.user.name}</p>
              <p className="truncate text-xs text-slate-400">{session?.user.email}</p>
            </div>
          </div>
          <form action={signOutAction} className="mt-3">
            <button
              type="submit"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-slate-50 px-8 py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
