import { Check } from "lucide-react";

const STEPS = [
  { key: "psychometric", label: "Assessment" },
  { key: "questionnaire", label: "Your setup" },
  { key: "analysis", label: "Your result" },
] as const;

export function OnboardingSteps({ current }: { current: (typeof STEPS)[number]["key"] }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="mb-6 flex items-center gap-2 text-xs">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {done ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
            </span>
            <span className={active ? "font-medium text-slate-900" : "text-slate-500"}>{step.label}</span>
            {index < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}
