"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AttemptState } from "@/lib/engine";

// One player for both assessments the engine drives: chapter tests and the onboarding
// psychometric. They differ only in wording and where they send the learner afterwards, so
// the actions are passed in as props (Server Actions are valid props for a Client Component)
// rather than imported, which keeps this component unaware of which flow it is serving.

type Language = "en" | "hi";

export type SaveAnswerAction = (
  attemptId: string,
  questionId: string,
  selectedOption: string,
  nextQuestionIndex: number,
) => Promise<{ ok: true } | { ok: false; message: string }>;

export type SubmitAttemptAction = (
  attemptId: string,
) => Promise<{ ok: true; attemptId: string } | { ok: false; message: string }>;

export function AssessmentPlayer({
  state,
  title,
  subtitle,
  initialLanguage,
  submitLabel,
  doneHref,
  appendAttemptParam = false,
  saveAnswer,
  submitAttempt,
}: {
  state: AttemptState;
  title: string;
  subtitle?: string;
  initialLanguage: Language;
  submitLabel: string;
  doneHref: string;
  appendAttemptParam?: boolean;
  saveAnswer: SaveAnswerAction;
  submitAttempt: SubmitAttemptAction;
}) {
  const router = useRouter();

  // The language toggle is pure client state over bilingual text already on the row, so it
  // switches instantly with no reload and no loss of answers (docs/spec.md §7). There is no
  // i18n framework here by design -- only question content is bilingual, UI chrome is English.
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [index, setIndex] = useState(
    Math.min(state.currentQuestionIndex, Math.max(state.questions.length - 1, 0)),
  );
  const [answers, setAnswers] = useState<Record<string, string>>(state.answers);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = state.questions.length;
  const question = state.questions[index];
  const selected = answers[question.id] ?? null;
  const answeredCount = Object.keys(answers).length;
  const isLast = index === total - 1;

  async function choose(optionKey: string) {
    if (pending) return;
    setError(null);

    const previous = answers;
    setAnswers({ ...answers, [question.id]: optionKey }); // optimistic

    setPending(true);
    try {
      const result = await saveAnswer(state.attemptId, question.id, optionKey, index);
      if (!result.ok) {
        setAnswers(previous);
        setError(result.message);
      }
    } finally {
      setPending(false);
    }
  }

  async function go(nextIndex: number) {
    const clamped = Math.min(Math.max(nextIndex, 0), total - 1);
    setIndex(clamped);
    setError(null);

    // Persist the resume point so a learner who closes the tab returns to this question.
    if (selected) {
      void saveAnswer(state.attemptId, question.id, selected, clamped);
    }
  }

  async function finish() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await submitAttempt(state.attemptId);
      if (result.ok) {
        router.push(appendAttemptParam ? `${doneHref}?attempt=${result.attemptId}` : doneHref);
      } else {
        setError(result.message);
        setPending(false);
      }
    } catch {
      setError("Something went wrong submitting your answers. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">
            Question {index + 1} of {total}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>

        <div className="flex flex-shrink-0 rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
          {(["en", "hi"] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLanguage(code)}
              aria-pressed={language === code}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                language === code ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {code === "en" ? "English" : "हिन्दी"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${total > 0 ? ((index + 1) / total) * 100 : 0}%` }}
        />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-base font-medium leading-relaxed text-slate-900">
          {language === "en" ? question.promptEn : question.promptHi}
        </p>

        <div className="mt-5 space-y-2">
          {question.options.map((option) => {
            const isSelected = selected === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => choose(option.key)}
                disabled={pending}
                className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                  isSelected
                    ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {option.key}
                </span>
                <span className="text-sm leading-relaxed text-slate-800">
                  {language === "en" ? option.en : option.hi}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0 || pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        <span className="text-xs text-slate-500">
          {answeredCount} of {total} answered
        </span>

        {isLast ? (
          <button
            type="button"
            onClick={finish}
            disabled={pending || answeredCount < total}
            title={answeredCount < total ? "Answer every question before submitting" : undefined}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
