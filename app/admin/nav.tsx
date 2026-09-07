"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/admin/companies", label: "Companies", enabled: true },
  { href: "/admin/learners", label: "Learners", enabled: false },
  { href: "/admin/course", label: "Course", enabled: false },
  { href: "/admin/questions", label: "Questions", enabled: false },
  { href: "/admin/import", label: "Import", enabled: false },
  { href: "/admin/analysis-bands", label: "Analysis bands", enabled: false },
  { href: "/admin/settings", label: "Settings", enabled: false },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
      {sections.map((section) => {
        if (!section.enabled) {
          return (
            <span
              key={section.href}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-gray-400"
            >
              {section.label}
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-300">
                Soon
              </span>
            </span>
          );
        }

        const isActive = pathname === section.href || pathname.startsWith(`${section.href}/`);

        return (
          <Link
            key={section.href}
            href={section.href}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
