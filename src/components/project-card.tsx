import Link from "next/link";
import { AlertTriangle, CalendarClock, UsersRound } from "lucide-react";
import { Pill } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { MEMBER_ROLES, PROJECT_STATUS, type ProjectSummary } from "@/lib/projects";

export function ProjectCard({ summary, index = 0 }: { summary: ProjectSummary; index?: number }) {
  const { project, role, memberCount, total, done, overdue, mine } = summary;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <Link
      href={`/projektek/${project._id}`}
      style={{ animationDelay: `${0.05 + index * 0.05}s` }}
      className="pg-card pg-rise group relative flex flex-col overflow-hidden rounded-3xl bg-linear-to-br from-volt/8 to-transparent p-5 hover:bg-white/5"
    >
      <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-ember/15 blur-2xl transition group-hover:bg-ember/30" />
      <div className="relative flex items-start justify-between gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-white/6 text-2xl ring-1 ring-white/10">{project.emoji}</span>
        <Pill tone={PROJECT_STATUS[project.status].tone}>{PROJECT_STATUS[project.status].label}</Pill>
      </div>
      <h3 className="relative mt-4 font-display text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{project.name}</h3>
      {project.description && <p className="relative mt-1 line-clamp-2 text-sm text-white/55">{project.description}</p>}

      <div className="relative mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-white/55">
          <span>
            {done}/{total} feladat kész
          </span>
          <span className="font-semibold text-volt">{percent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
          <div className="pg-grow h-full rounded-full bg-linear-to-r from-volt to-ember" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/50">
        <span className="inline-flex items-center gap-1.5">
          <UsersRound size={13} aria-hidden /> {memberCount} tag
        </span>
        {project.dueDate && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={13} aria-hidden /> {formatShortDate(project.dueDate)}
          </span>
        )}
        {overdue > 0 && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-red-300">
            <AlertTriangle size={13} aria-hidden /> {overdue} késik
          </span>
        )}
        {mine > 0 && <span className="font-semibold text-volt">{mine} a tiéd</span>}
        <span className="ml-auto">{MEMBER_ROLES[role].label}</span>
      </div>
    </Link>
  );
}
