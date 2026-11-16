import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  History,
  KanbanSquare,
  ListChecks,
  PartyPopper,
  Settings,
  UsersRound,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { DeleteProjectForm } from "@/components/delete-project-form";
import { InviteForm } from "@/components/invite-form";
import { MemberRow, RevokeInviteButton } from "@/components/member-row";
import { ProjectForm } from "@/components/project-form";
import { TaskCard, type TaskView } from "@/components/task-card";
import { TaskForm } from "@/components/task-form";
import { Empty, Panel, Pill, Skeleton } from "@/components/ui";
import { formatShortDate, formatStamp } from "@/lib/dates";
import {
  MEMBER_ROLES,
  PROJECT_STATUS,
  TASK_PRIORITY,
  TASK_STATUS,
  TASK_STATUS_ORDER,
  activityCol,
  can,
  commentsCol,
  invitesCol,
  isOverdue,
  listMembers,
  projectAccess,
  tasksCol,
  type TaskDocument,
} from "@/lib/projects";
import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/session";
import { findUsersByIds } from "@/lib/users";

export const metadata: Metadata = { title: "Projekt" };

const VIEWS = [
  { key: "tabla", label: "Tábla", icon: KanbanSquare },
  { key: "lista", label: "Lista", icon: ListChecks },
  { key: "tagok", label: "Tagok", icon: UsersRound },
  { key: "aktivitas", label: "Aktivitás", icon: History },
  { key: "beallitasok", label: "Beállítások", icon: Settings },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

export default function ProjectPage({ params, searchParams }: PageProps<"/projektek/[id]">) {
  return (
    <div className="space-y-6">
      <Link href="/projektek" className="inline-flex items-center gap-1.5 text-sm text-white/55 hover:text-white">
        <ArrowLeft size={15} aria-hidden /> Projektek
      </Link>
      <Suspense fallback={<Skeleton className="h-[40rem]" />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const rankTask = (a: TaskDocument, b: TaskDocument) =>
  TASK_PRIORITY[b.priority].rank - TASK_PRIORITY[a.priority].rank || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.getTime() - b.createdAt.getTime();

async function Detail({ params, searchParams }: Pick<PageProps<"/projektek/[id]">, "params" | "searchParams">) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const access = await projectAccess(user, id);
  if (!access) notFound();
  const { project, role } = access;
  const view: ViewKey = VIEWS.some((item) => item.key === query.nezet) ? (query.nezet as ViewKey) : "tabla";
  const canContribute = can.contribute(role) && project.status !== "lezart";
  const canManage = can.manage(role);

  const [tasks, members, comments] = await Promise.all([
    (await tasksCol()).find({ projectId: project._id }).toArray(),
    listMembers(project),
    (await commentsCol()).aggregate<{ _id: unknown; count: number }>([{ $match: { projectId: project._id } }, { $group: { _id: "$taskId", count: { $sum: 1 } } }]).toArray(),
  ]);
  const nameOf = new Map(members.map((member) => [member.userId, member.name]));
  const commentCount = new Map(comments.map((row) => [String(row._id), row.count]));
  const views: TaskView[] = tasks.sort(rankTask).map((task) => ({
    task,
    assigneeName: task.assigneeId ? nameOf.get(String(task.assigneeId)) : undefined,
    comments: commentCount.get(String(task._id)) ?? 0,
  }));
  const done = tasks.filter((task) => task.status === "kesz").length;
  const overdue = tasks.filter((task) => isOverdue(task)).length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const people = members.filter((member) => member.role !== "megtekinto").map((member) => ({ id: member.userId, name: member.name }));

  return (
    <div className="space-y-6">
      {query.udv && (
        <div className="pg-rise flex items-center gap-4 rounded-2xl border border-volt/25 bg-linear-to-r from-volt/15 to-transparent p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-volt/20 text-volt">
            <PartyPopper size={22} aria-hidden />
          </span>
          <p className="font-semibold">{query.udv === "uj" ? "A projekt elkészült. Vegyél fel feladatokat, majd hívd meg a csapatot a Tagok fülön." : "Üdv a projektben! Nézd meg, mi vár rád."}</p>
        </div>
      )}

      <header className="pg-panel pg-rise relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-ember/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-3xl bg-white/6 text-3xl ring-1 ring-white/10">{project.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={PROJECT_STATUS[project.status].tone}>{PROJECT_STATUS[project.status].label}</Pill>
              <Pill tone="info">{MEMBER_ROLES[role].label}</Pill>
            </div>
            <h1 className="mt-2 font-display text-3xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-4xl">{project.name}</h1>
            {project.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-white/60">{project.description}</p>}
          </div>
          <div className="flex -space-x-2">
            {members.slice(0, 6).map((member) => (
              <span key={member.userId} className="rounded-full ring-2 ring-ink-900">
                <Avatar name={member.name} size={34} />
              </span>
            ))}
            {members.length > 6 && <span className="grid size-[34px] place-items-center rounded-full bg-white/10 text-xs font-semibold ring-2 ring-ink-900">+{members.length - 6}</span>}
          </div>
        </div>
        <div className="relative mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-white/55">
              <span>
                {done}/{tasks.length} feladat kész
              </span>
              <span className="font-semibold text-volt">{percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/8">
              <div className="pg-grow h-full rounded-full bg-linear-to-r from-volt to-ember" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-white/60">
            {project.dueDate && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock size={15} aria-hidden /> Határidő: {formatShortDate(project.dueDate)}
              </span>
            )}
            {overdue > 0 && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-red-300">
                <AlertTriangle size={15} aria-hidden /> {overdue} késő feladat
              </span>
            )}
          </div>
        </div>
      </header>

      <nav aria-label="Nézetek" className="flex gap-1 overflow-x-auto rounded-2xl border border-white/8 bg-white/3 p-1 [scrollbar-width:none]">
        {VIEWS.filter((item) => item.key !== "beallitasok" || canManage).map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/projektek/${project._id}?nezet=${key}`}
            aria-current={view === key ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${view === key ? "bg-volt text-ink-950" : "text-white/60 hover:bg-white/6 hover:text-white"}`}
          >
            <Icon size={15} aria-hidden /> {label}
          </Link>
        ))}
      </nav>

      {view === "tabla" && (
        <div className="space-y-4">
          {canContribute && <TaskForm projectId={String(project._id)} people={people} />}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {TASK_STATUS_ORDER.map((status) => {
              const column = views.filter((item) => item.task.status === status);
              return (
                <section key={status} aria-label={TASK_STATUS[status].label} className="rounded-3xl border border-white/8 bg-white/2 p-3">
                  <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
                    <span className={`size-2 rounded-full ${TASK_STATUS[status].dot}`} aria-hidden /> {TASK_STATUS[status].label}
                    <span className="ml-auto rounded-full bg-white/8 px-2 py-0.5 text-xs text-white/55">{column.length}</span>
                  </h2>
                  <ul className="space-y-2.5">
                    {column.map((item) => (
                      <TaskCard key={String(item.task._id)} view={item} canMove={canContribute} />
                    ))}
                    {column.length === 0 && <li className="rounded-2xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/30">Üres</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {view === "lista" && (
        <div className="space-y-4">
          {canContribute && <TaskForm projectId={String(project._id)} people={people} />}
          {views.length === 0 ? (
            <Empty icon={ListChecks} title="Még nincs feladat" text="Vegyél fel egyet az „Új feladat” gombbal." />
          ) : (
            <ul className="grid gap-2.5 lg:grid-cols-2">
              {views.map((item) => (
                <TaskCard key={String(item.task._id)} view={item} canMove={canContribute} />
              ))}
            </ul>
          )}
        </div>
      )}

      {view === "tagok" && <MembersView projectId={String(project._id)} members={members} canManage={canManage} isAdmin={user.isAdmin} selfId={user.id} />}
      {view === "aktivitas" && <ActivityView projectId={project._id} />}
      {view === "beallitasok" && canManage && (
        <div className="space-y-6">
          <Panel title="A projekt adatai" icon={Settings}>
            <ProjectForm
              project={{ id: String(project._id), name: project.name, description: project.description, status: project.status, dueDate: project.dueDate, emoji: project.emoji }}
            />
          </Panel>
          {user.isAdmin && (
            <Panel title="Veszélyes zóna">
              <DeleteProjectForm projectId={String(project._id)} name={project.name} />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

async function MembersView({
  projectId,
  members,
  canManage,
  isAdmin,
  selfId,
}: {
  projectId: string;
  members: Awaited<ReturnType<typeof listMembers>>;
  canManage: boolean;
  isAdmin: boolean;
  selfId: string;
}) {
  const pending = canManage
    ? await (await invitesCol()).find({ projectId: new ObjectId(projectId), acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).toArray()
    : [];
  const inviters = await findUsersByIds(pending.map((invite) => invite.invitedBy));
  const inviterName = new Map(inviters.map((person) => [String(person._id), person.name]));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        <Panel title={`Tagok (${members.length})`} icon={UsersRound}>
          <ul className="space-y-2.5">
            {members.map((member) => (
              <MemberRow key={member.userId} projectId={projectId} member={member} canManage={canManage} isAdmin={isAdmin} isSelf={member.userId === selfId} />
            ))}
          </ul>
        </Panel>
        {pending.length > 0 && (
          <Panel title="Függő meghívók">
            <ul className="space-y-2">
              {pending.map((invite) => (
                <li key={String(invite._id)} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{invite.email}</span>
                  <span className="text-xs text-white/50">
                    {MEMBER_ROLES[invite.role].label} · {inviterName.get(String(invite.invitedBy)) ?? "?"} · lejár: {formatStamp(invite.expiresAt)}
                  </span>
                  <RevokeInviteButton inviteId={String(invite._id)} projectId={projectId} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
      {canManage ? (
        <Panel title="Új tag meghívása" icon={UsersRound}>
          <InviteForm projectId={projectId} />
        </Panel>
      ) : (
        <Panel>
          <p className="text-sm text-white/55">Új tagot a projektvezető vagy az adminisztrátor hívhat meg.</p>
        </Panel>
      )}
    </div>
  );
}

async function ActivityView({ projectId }: { projectId: ObjectId }) {
  const entries = await (await activityCol()).find({ projectId }).sort({ at: -1 }).limit(60).toArray();
  return (
    <Panel title="Tevékenység" icon={History}>
      {entries.length === 0 ? (
        <p className="text-sm text-white/55">Még nincs rögzített tevékenység.</p>
      ) : (
        <ol className="space-y-1">
          {entries.map((entry) => (
            <li key={String(entry._id)} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/4">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-volt" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-white/80">
                {entry.text}
                {entry.viaPajzsi && <span className="ml-2 rounded-full bg-ember/20 px-2 py-0.5 text-[0.65rem] font-semibold text-ember-bright">Pajzsi segített</span>}
              </p>
              <time dateTime={entry.at.toISOString()} className="shrink-0 text-xs text-white/45">
                {formatStamp(entry.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
