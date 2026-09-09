import { redirect } from "next/navigation";

import { LearnerRecordView } from "@/components/learner-record";
import { getLearnerRecord } from "@/lib/reporting";
import { getSessionScope } from "@/lib/session";

// docs/spec.md §5: the learner's own scorecard -- psychometric result, chapter scores and
// completion. It renders the same record view a manager and the master see, so there is one
// definition of "how this learner is doing" rather than three that can drift apart.
export default async function ScorecardPage() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const record = await getLearnerRecord(scope, scope.userId);
  if (!record) redirect("/course");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Your scorecard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your assessment result, chapter scores and progress through the course.
        </p>
      </div>
      <LearnerRecordView record={record} showIdentity={false} />
    </div>
  );
}
