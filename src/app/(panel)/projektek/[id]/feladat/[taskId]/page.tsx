import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, MessageSquare, Pencil } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CommentForm } from "@/components/comment-form";
import { TaskEditForm } from "@/components/task-edit-form";
import { Panel, Pill, Skeleton } from "@/components/ui";
import { formatStamp } from "@/lib/dates";
import { TASK_PRIORITY, TASK_STATUS, can, commentsCol, listMembers, parseId, projectAccess, tasksCol } from "@/lib/projects";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Feladat" };

export default function TaskPage({ params }: PageProps<"/projektek/[id]/feladat/[taskId]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<Skeleton className="h-[34rem]" />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: Pick<PageProps<"/projektek/[id]/feladat/[taskId]">, "params">) {
  const [{ id, taskId }, user] = await Promise.all([params, requireUser()]);
  const access = await projectAccess(user, id);
  const taskOid = parseId(taskId);
  if (!access || !taskOid) notFound();
  const task = await (await tasksCol()).findOne({ _id: taskOid, projectId: access.project._id });
  if (!task) notFound();

  const [members, comments] = await Promise.all([
    listMembers(access.project),
    (await commentsCol()).find({ taskId: task._id }).sort({ createdAt: 1 }).toArray(),
  ]);
  const nameOf = new Map(members.map((member) => [member.userId, member.name]));
  const people = members.filter((member) => member.role !== "megtekinto").map((member) => ({ id: member.userId, name: member.name }));
  const open = access.project.status !== "lezart";
  const canEdit = can.contribute(access.role) && open;
  const canDelete = can.manage(access.role) || (task.createdBy.equals(user.oid) && can.contribute(access.role));

  return (
    <>
      <Link href={`/projektek/${access.project._id}`} className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white">
        <ArrowLeft size={15} aria-hidden /> {access.project.emoji} {access.project.name}
      </Link>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <Panel
          title={
            <span className="flex flex-wrap items-center gap-2">
              Feladat
              <Pill tone={TASK_STATUS[task.status].tone}>{TASK_STATUS[task.status].label}</Pill>
              <Pill tone={TASK_PRIORITY[task.priority].tone}>{TASK_PRIORITY[task.priority].label}</Pill>
            </span>
          }
          icon={Pencil}
        >
          <TaskEditForm
            canEdit={canEdit}
            canDelete={canDelete}
            people={people}
            task={{
              id: String(task._id),
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              assigneeId: task.assigneeId ? String(task.assigneeId) : undefined,
              dueDate: task.dueDate,
            }}
          />
          <p className="mt-4 text-xs text-white/35">
            Létrehozta: {nameOf.get(String(task.createdBy)) ?? "?"} · {formatStamp(task.createdAt)}
          </p>
        </Panel>

        <Panel title={`Megjegyzések (${comments.length})`} icon={MessageSquare}>
          <ul className="space-y-3">
            {comments.map((comment) => {
              const author = nameOf.get(String(comment.authorId)) ?? "Volt tag";
              return (
                <li key={String(comment._id)} className="flex gap-2.5">
                  <Avatar name={author} size={30} />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-white/8 bg-white/4 px-3.5 py-2.5">
                    <p className="text-xs text-white/50">
                      <strong className="text-white/80">{author}</strong> · {formatStamp(comment.createdAt)}
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-line text-white/85 [overflow-wrap:anywhere]">{comment.text}</p>
                  </div>
                </li>
              );
            })}
            {comments.length === 0 && <li className="text-sm text-white/45">Még nincs megjegyzés.</li>}
          </ul>
          {canEdit && (
            <div className="mt-5 border-t border-white/8 pt-4">
              <CommentForm taskId={String(task._id)} projectId={String(access.project._id)} />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
