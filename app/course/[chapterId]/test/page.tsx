import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getChapterForLearner } from "@/lib/course";
import { startOrResumeAttempt } from "@/lib/engine";
import { getSessionScope } from "@/lib/session";

import { AssessmentPlayer } from "@/components/assessment-player";

import { saveAnswerAction, submitAttemptAction } from "./actions";

export default async function TestPage({ params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;

  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const detail = await getChapterForLearner(scope, chapterId);
  if (!detail) redirect("/course");
  if (detail.chapter.status === "locked") redirect("/course");
  if (!detail.setId) redirect(`/course/${chapterId}`);

  // startOrResumeAttempt enforces the retake limit and refuses a test already passed, so a
  // learner who navigates straight here is sent back with the reason rather than a crash.
  let state;
  try {
    state = await startOrResumeAttempt(scope, detail.setId);
  } catch (error) {
    redirect(`/course/${chapterId}?error=${encodeURIComponent((error as Error).message)}`);
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const initialLanguage = session?.user.preferredLanguage === "hi" ? "hi" : "en";

  return (
    <AssessmentPlayer
      state={state}
      title={`Chapter ${detail.chapter.order}: ${detail.chapter.titleEn}`}
      subtitle={`attempt ${state.attemptNo}`}
      initialLanguage={initialLanguage}
      submitLabel="Submit test"
      doneHref={`/course/${chapterId}/test/result`}
      appendAttemptParam
      saveAnswer={saveAnswerAction}
      submitAttempt={submitAttemptAction}
    />
  );
}
