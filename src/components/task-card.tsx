import Link from "next/link";
import { AlertTriangle, CalendarClock, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { TaskStatusButtons } from "@/components/task-status";
import { Pill } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { TASK_PRIORITY, isOverdue, type TaskDocument } from "@/lib/projects";

export type TaskView = {
  task: TaskDocument;
  assigneeName?: string;
  comments: number;
  projectName?: string;
};

export function TaskCard({ view, canMove, showProject = false }: { view: TaskView; canMove: boolean; showProject?: boolean }) {
  const { task, assigneeName, comments, projectName } = view;
  const late = isOverdue(task);
  const priority = TASK_PRIORITY[task.priority];
  return (
    <li className="pg-card group rounded-2xl p-3.5">
      {showProject && projectName && <p className="mb-1 truncate text-[0.68rem] font-semibold tracking-wide text-volt/80 uppercase">{projectName}</p>}
      <Link href={`/projektek/${task.projectId}/feladat/${task._id}`} className="block text-sm leading-snug font-semibold [overflow-wrap:anywhere] hover:text-volt-bright">
        {task.title}
      </Link>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {task.priority !== "normal" && <Pill tone={priority.tone}>{priority.label}</Pill>}
        {task.dueDate && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${late ? "bg-red-500/15 font-semibold text-red-200" : "bg-white/6 text-white/60"}`}>
            {late ? <AlertTriangle size={11} aria-hidden /> : <CalendarClock size={11} aria-hidden />} {formatShortDate(task.dueDate)}
          </span>
        )}
        {comments > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-white/45">
            <MessageSquare size={11} aria-hidden /> {comments}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {assigneeName ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-white/60">
            <Avatar name={assigneeName} size={22} /> <span className="truncate">{assigneeName}</span>
          </span>
        ) : (
          <span className="text-xs text-white/30">Nincs felelős</span>
        )}
        <TaskStatusButtons taskId={String(task._id)} status={task.status} disabled={!canMove} />
      </div>
    </li>
  );
}
