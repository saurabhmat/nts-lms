import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionScope } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");
  if (scope.role !== "master") redirect("/403");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gray-200 px-6 py-4">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 text-sm font-medium">
          <span className="text-gray-900">NTS LMS Admin</span>
          <Link href="/admin/companies" className="text-gray-600 hover:text-gray-900">
            Companies
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
