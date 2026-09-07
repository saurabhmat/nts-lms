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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Companies</h1>
        <p className="mt-1 text-sm text-gray-600">
          {companies.length} organisation{companies.length === 1 ? "" : "s"}
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form
        action={createCompanyAction}
        className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 p-4"
      >
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-gray-600">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="slug" className="block text-xs font-medium text-gray-600">
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            required
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="seatLimit" className="block text-xs font-medium text-gray-600">
            Seat limit
          </label>
          <input
            id="seatLimit"
            name="seatLimit"
            type="number"
            min={1}
            className="mt-1 w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Create company
        </button>
      </form>

      <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
        {companies.map((company) => (
          <li key={company.id} className="px-4 py-3">
            <Link
              href={`/admin/companies/${company.id}`}
              className="flex items-center justify-between"
            >
              <span className="font-medium text-gray-900">{company.name}</span>
              <span className="text-sm text-gray-500">
                {company.slug} · {company.status}
              </span>
            </Link>
          </li>
        ))}
        {companies.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-gray-500">No companies yet.</li>
        )}
      </ul>
    </div>
  );
}
