import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createCompany, listCompanies } from "@/lib/admin/companies";
import { getSessionScope } from "@/lib/session";

async function createCompanyAction(formData: FormData) {
  "use server";

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const seatLimitRaw = String(formData.get("seatLimit") ?? "").trim();
  const seatLimit = seatLimitRaw ? Number(seatLimitRaw) : undefined;

  if (!name || !slug) {
    redirect(`/admin/companies?error=${encodeURIComponent("Name and slug are required")}`);
  }

  try {
    await createCompany(scope, { name, slug, seatLimit });
  } catch (error) {
    redirect(`/admin/companies?error=${encodeURIComponent((error as Error).message)}`);
  }

  redirect("/admin/companies");
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const companies = await listCompanies(scope);

  const inputClass =
    "mt-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Companies</h1>
        <p className="mt-1 text-sm text-slate-500">
          {companies.length} organisation{companies.length === 1 ? "" : "s"}
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        action={createCompanyAction}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-slate-600">
            Name
          </label>
          <input id="name" name="name" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="slug" className="block text-xs font-medium text-slate-600">
            Slug
          </label>
          <input id="slug" name="slug" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="seatLimit" className="block text-xs font-medium text-slate-600">
            Seat limit
          </label>
          <input
            id="seatLimit"
            name="seatLimit"
            type="number"
            min={1}
            className={`${inputClass} w-24`}
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          Create company
        </button>
      </form>

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {companies.map((company) => (
          <li key={company.id}>
            <Link
              href={`/admin/companies/${company.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-50"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <Building2 className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="font-medium text-slate-900">{company.name}</span>
              </span>
              <span className="flex items-center gap-2 text-sm text-slate-500">
                {company.slug} · {company.status}
                <ChevronRight className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
              </span>
            </Link>
          </li>
        ))}
        {companies.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-500">No companies yet.</li>
        )}
      </ul>
    </div>
  );
}
