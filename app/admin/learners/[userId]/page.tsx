import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LearnerRecordView } from "@/components/learner-record";
import { getLearnerRecord } from "@/lib/reporting";
import { getSessionScope } from "@/lib/session";

export default async function AdminLearnerRecordPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  // getLearnerRecord throws on an access miss rather than returning null, so an id belonging to
  // someone out of scope is refused here rather than rendering a blank record.
  let record;
  try {
    record = await getLearnerRecord(scope, userId);
  } catch {
    redirect("/403");
  }
  if (!record) redirect("/admin/learners");

  return (
    <div className="space-y-6">
      <Link
        href="/admin/learners"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        All learners
      </Link>
      <LearnerRecordView record={record} />
    </div>
  );
}
