import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getSessionScope } from "@/lib/session";

import { signOutAction } from "./actions";
import { AdminNav } from "./nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  if (scope.role !== "master") redirect("/403");

  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="px-5 py-5">
          <p className="text-sm font-semibold tracking-tight text-gray-900">NTS LMS</p>
          <p className="text-xs text-gray-500">Admin</p>
        </div>

        <AdminNav />

        <div className="mt-auto border-t border-gray-200 px-5 py-4">
          <p className="truncate text-sm font-medium text-gray-900">{session?.user.name}</p>
          <p className="truncate text-xs text-gray-500">{session?.user.email}</p>
          <form action={signOutAction} className="mt-3">
            <button
              type="submit"
              className="text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-gray-50 px-8 py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
