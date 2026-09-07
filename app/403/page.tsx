export default function ForbiddenPage() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <p className="text-sm font-semibold text-blue-600">403</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
        You don&apos;t have access to this page
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Sign in with an account that has permission to view this.
      </p>
    </main>
  );
}
