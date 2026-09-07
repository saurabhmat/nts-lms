"use client";

import {
  BarChart3,
  Building2,
  ListChecks,
  type LucideIcon,
  Settings,
  BookOpen,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const sections: { href: string; label: string; icon: LucideIcon; enabled: boolean }[] = [
  { href: "/admin/companies", label: "Companies", icon: Building2, enabled: true },
  { href: "/admin/team", label: "Team", icon: ShieldCheck, enabled: true },
  { href: "/admin/learners", label: "Learners", icon: Users, enabled: false },
  { href: "/admin/course", label: "Course", icon: BookOpen, enabled: false },
  { href: "/admin/questions", label: "Questions", icon: ListChecks, enabled: false },
  { href: "/admin/import", label: "Import", icon: Upload, enabled: false },
  { href: "/admin/analysis-bands", label: "Analysis bands", icon: BarChart3, enabled: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, enabled: false },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
      {sections.map(({ href, label, icon: Icon, enabled }) => {
        if (!enabled) {
          return (
            <span
              key={href}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-slate-500"
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {label}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Soon
              </span>
            </span>
          );
        }

        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-blue-600 text-white shadow-sm shadow-blue-950/20"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
