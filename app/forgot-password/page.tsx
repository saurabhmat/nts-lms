import Link from "next/link";

import { requestReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-slate-900 px-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-white p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            N
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-900">NTS LMS</p>
            <p className="text-xs text-slate-500">Admin Console</p>
          </div>
        </div>

        <h1 className="mt-6 text-lg font-semibold tracking-tight text-slate-900">
          Reset your password
        </h1>

        {sent ? (
          <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            If that email has an account, a reset link has been sent.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">
              Enter your email and we&apos;ll send you a reset link.
            </p>
            <form action={requestReset} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                Send reset link
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
