import "server-only";
import type { TaskView } from "@/components/task-card";
import { TASK_PRIORITY, can, commentsCol, isOverdue, listProjects, projectsCol, tasksCol, todayKey, type TaskDocument } from "@/lib/projects";
import type { CurrentUser } from "@/lib/session";
import { addDays } from "@/lib/dates";

const rank = (a: TaskDocument, b: TaskDocument) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || TASK_PRIORITY[b.priority].rank - TASK_PRIORITY[a.priority].rank;

/** A felhasználó nyitott feladatai, csoportosítva (késik / ezen a héten / később / határidő nélkül). */
export async function loadMyTasks(user: Pick<CurrentUser, "oid" | "isAdmin">) {
  const projects = (await listProjects(user)).filter((item) => item.project.status !== "lezart" && can.contribute(item.role));
  const ids = projects.map((item) => item.project._id);
  const tasks = ids.length ? await (await tasksCol()).find({ projectId: { $in: ids }, assigneeId: user.oid, status: { $ne: "kesz" } }).toArray() : [];
  const comments = tasks.length
    ? await (await commentsCol()).aggregate<{ _id: unknown; count: number }>([{ $match: { taskId: { $in: tasks.map((task) => task._id) } } }, { $group: { _id: "$taskId", count: { $sum: 1 } } }]).toArray()
    : [];
  const commentCount = new Map(comments.map((row) => [String(row._id), row.count]));
  const projectName = new Map(projects.map((item) => [String(item.project._id), `${item.project.emoji} ${item.project.name}`]));
  const today = todayKey();
  const weekEnd = addDays(today, 7);
  const views = (list: TaskDocument[]): TaskView[] =>
    list.sort(rank).map((task) => ({ task, comments: commentCount.get(String(task._id)) ?? 0, projectName: projectName.get(String(task.projectId)) }));

  const groups = [
    { key: "kesik", label: "Késik", tone: "text-red-300", items: views(tasks.filter((task) => isOverdue(task, today))) },
    { key: "het", label: "Ezen a héten esedékes", tone: "text-amber-200", items: views(tasks.filter((task) => task.dueDate && task.dueDate >= today && task.dueDate <= weekEnd)) },
    { key: "kesobb", label: "Később", tone: "text-white", items: views(tasks.filter((task) => task.dueDate && task.dueDate > weekEnd)) },
    { key: "nincs", label: "Határidő nélkül", tone: "text-white/70", items: views(tasks.filter((task) => !task.dueDate)) },
  ];
  void projectsCol;
  return { groups, total: tasks.length };
}
