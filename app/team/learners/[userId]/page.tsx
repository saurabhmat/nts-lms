import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LearnerRecordView } from "@/components/learner-record";
import { getLearnerRecord } from "@/lib/reporting";
import { getSessionScope } from "@/lib/session";

// A manager may open any learner in their own company, and no one else's. The check lives in
// getLearnerRecord (lib/reporting.ts), not here: this URL is a public endpoint and the id in it
// is untrusted.
export default async function TeamLearnerRecordPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  let record;
  try {
    record = await getLearnerRecord(scope, userId);
  } catch {
    redirect("/403");
  }
  if (!record) redirect("/team");

  return (
    <div className="space-y-6">
      <Link
        href="/team"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to team
      </Link>
      <LearnerRecordView record={record} />
    </div>
  );
}
