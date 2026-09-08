import { BookOpen, CheckCircle2, FileText, Lock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listCourseForLearner, type ChapterStatus, type CourseChapter } from "@/lib/course";
import { getSessionScope } from "@/lib/session";

const STATUS_LABEL: Record<ChapterStatus, string> = {
  locked: "Locked",
  available: "Start",
  in_progress: "In progress",
  complete: "Complete",
};

function StatusBadge({ status }: { status: ChapterStatus }) {
  const styles: Record<ChapterStatus, string> = {
    locked: "bg-slate-100 text-slate-500",
    available: "bg-blue-50 text-blue-700",
    in_progress: "bg-amber-50 text-amber-700",
    complete: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function ChapterCard({ chapter }: { chapter: CourseChapter }) {
  const locked = chapter.status === "locked";

  const card = (
    <article
      className={`flex h-full flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${
        locked
          ? "border-slate-200 opacity-70"
          : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
      }`}
    >
      {/* Course-card banner: a chapter number over a tinted panel, standing in for the
          thumbnail a video course would have. No video at launch (docs/spec.md §9). */}
      <div
        className={`relative flex h-24 items-center justify-center ${
          chapter.status === "complete"
            ? "bg-emerald-600"
            : locked
              ? "bg-slate-300"
              : "bg-gradient-to-br from-blue-600 to-blue-700"
        }`}
      >
        <span className="text-3xl font-bold tabular-nums text-white/95">{chapter.order}</span>
        {locked && (
          <Lock className="absolute right-3 top-3 h-4 w-4 text-white/80" strokeWidth={2} />
        )}
        {chapter.status === "complete" && (
          <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-white" strokeWidth={2} />
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold leading-snug text-slate-900">{chapter.titleEn}</h2>
          <StatusBadge status={chapter.status} />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{chapter.titleHi}</p>
        {chapter.summaryEn && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{chapter.summaryEn}</p>
        )}

        <div className="mt-auto flex items-center gap-3 pt-3 text-[11px] text-slate-500">
          {chapter.hasNotes && (
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" strokeWidth={1.75} />
              Notes
            </span>
          )}
          {chapter.questionCount > 0 && (
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" strokeWidth={1.75} />
              {chapter.questionCount} questions
            </span>
          )}
          {chapter.testScore !== null && (
            <span className="ml-auto font-medium tabular-nums text-slate-600">
              Best: {chapter.testScore}
            </span>
          )}
        </div>
      </div>
    </article>
  );

  if (locked) {
    return (
      <div key={chapter.id} title="Finish the previous chapter to unlock this one">
        {card}
      </div>
    );
  }

  return (
    <Link key={chapter.id} href={`/course/${chapter.id}`} className="block h-full">
      {card}
    </Link>
  );
}

export default async function CoursePage() {
  const scope = await getSessionScope();
  if (!scope) redirect("/login");

  const chapters = await listCourseForLearner(scope);
  const complete = chapters.filter((chapter) => chapter.status === "complete").length;
  const percentComplete = chapters.length > 0 ? Math.round((complete / chapters.length) * 100) : 0;
  const next = chapters.find((chapter) => chapter.status === "available" || chapter.status === "in_progress");

  if (chapters.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <BookOpen className="mx-auto h-8 w-8 text-slate-300" strokeWidth={1.5} />
        <h1 className="mt-3 text-base font-semibold text-slate-900">Your course is being prepared</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          No chapters have been published yet. You will be able to start as soon as your trainer publishes
          the first one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Sales Mastery</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {complete} of {chapters.length} chapters complete
            </p>
          </div>
          {next && (
            <Link
              href={`/course/${next.id}`}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <PlayCircle className="h-4 w-4" strokeWidth={1.75} />
              {complete === 0 ? "Start course" : "Continue"}
            </Link>
          )}
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {chapters.map((chapter) => (
          <ChapterCard key={chapter.id} chapter={chapter} />
        ))}
      </div>
    </div>
  );
}
