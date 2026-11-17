import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ArrowRight, CircleCheck, ClipboardList, FolderKanban, ListChecks, MailPlus, PartyPopper, Plus, Zap } from "lucide-react";
import { countPendingRequests } from "@/lib/project-requests";
import { ProjectCard } from "@/components/project-card";
import { Stat } from "@/components/ui";
import { TaskCard } from "@/components/task-card";
import { formatStamp, greeting } from "@/lib/dates";
import { loadMyTasks } from "@/lib/my-tasks";
import { pendingInvitesFor } from "@/lib/project-invites";
import { activityCol, listProjects } from "@/lib/projects";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Áttekintés" };

const today = new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "long", day: "numeric", weekday: "long" });

export default function OverviewPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const now = new Date();
  const [projects, mine, invites, waiting] = await Promise.all([listProjects(user), loadMyTasks(user), pendingInvitesFor(user.email), user.isAdmin ? countPendingRequests() : 0]);
  const active = projects.filter((item) => item.project.status === "aktiv");
  const overdue = mine.groups.find((group) => group.key === "kesik")?.items.length ?? 0;
  const next = mine.groups.flatMap((group) => group.items).slice(0, 4);
  const ids = projects.map((item) => item.project._id);
  const activity = ids.length ? await (await activityCol()).find({ projectId: { $in: ids } }).sort({ at: -1 }).limit(8).toArray() : [];
  const nameOf = new Map(projects.map((item) => [String(item.project._id), item.project.name]));

  return (
    <div className="space-y-8">
      {params.udv === "1" && (
        <div className="pg-rise flex items-center gap-4 rounded-2xl border border-volt/25 bg-linear-to-r from-volt/15 to-transparent p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-volt/20 text-volt">
            <PartyPopper size={22} aria-hidden />
          </span>
          <div>
            <p className="font-semibold">A fiókod elkészült. Üdv a Rendkívüli projektben!</p>
            <p className="text-sm text-white/60">{user.isAdmin ? "Hozd létre az első projektet, majd hívd meg a csapatot." : "Nézd meg a projektjeidet és a rád váró feladatokat."}</p>
          </div>
        </div>
      )}

      <section className="pg-panel pg-rise relative overflow-hidden rounded-[2rem] p-8 sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-ember/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-volt/20 blur-3xl" />
        <Bolt />
        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.22em] text-volt uppercase">
            <Zap size={15} aria-hidden /> Rendkívüli projekt · {today.format(now)}
          </p>
          <h1 className="mt-4 font-display text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            {greeting(now)},
            <br />
            <span className="pg-accent-text">{user.firstName}!</span>
          </h1>
          <p className="mt-4 max-w-xl text-white/65">
            {projects.length
              ? `${active.length} aktív projekted van, ${mine.total} nyitott feladat vár rád${overdue ? `, ebből ${overdue} késik` : ""}.`
              : user.isAdmin
                ? "Itt hozhatod létre a rendkívüli projekteket, és hívhatod meg beléjük azokat, akikkel együtt dolgoznál."
                : "Kérvényezz projektindítást, vagy várd meg a meghívást: a projektjeid és a feladataid itt jelennek meg."}
          </p>
          {!user.isAdmin && (
            <Link href="/kervenyek" className="pg-button mt-6 inline-flex h-12 items-center gap-2 rounded-xl px-6 font-semibold">
              <Plus size={18} aria-hidden /> Projekt kérvényezése
            </Link>
          )}
          {user.isAdmin && (
            <Link href="/projektek" className="pg-button mt-6 inline-flex h-12 items-center gap-2 rounded-xl px-6 font-semibold">
              <Plus size={18} aria-hidden /> Új projekt
            </Link>
          )}
        </div>
      </section>

      {waiting > 0 && (
        <Link href="/kervenyek" className="pg-rise flex items-center gap-4 rounded-2xl border border-volt/35 bg-volt/10 p-5 transition hover:bg-volt/15">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-volt/20 text-volt">
            <ClipboardList size={22} aria-hidden />
          </span>
          <p className="flex-1 font-semibold">{waiting} projektindítási kérvény vár jóváhagyásra</p>
          <ArrowRight size={18} aria-hidden className="text-volt" />
        </Link>
      )}

      {invites.length > 0 && (
        <Link href="/meghivasaim" className="pg-rise flex items-center gap-4 rounded-2xl border border-ember/40 bg-ember/10 p-5 transition hover:bg-ember/15">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ember/25 text-ember-bright">
            <MailPlus size={22} aria-hidden />
          </span>
          <p className="flex-1 font-semibold">{invites.length} projektmeghívás vár a válaszodra</p>
          <ArrowRight size={18} aria-hidden className="text-ember-bright" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Aktív projekt" value={active.length} icon={FolderKanban} tone="text-volt" />
        <Stat label="Nyitott feladatom" value={mine.total} icon={ListChecks} tone="text-white" />
        <Stat label="Késő feladatom" value={overdue} icon={AlertTriangle} tone={overdue ? "text-red-300" : "text-white/70"} />
        <Stat label="Függő meghívás" value={invites.length} icon={MailPlus} tone={invites.length ? "text-ember-bright" : "text-white/70"} />
      </div>

      {next.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Ami legközelebb esedékes</h2>
            <Link href="/feladataim" className="text-sm text-volt hover:underline">
              Mind a feladataim
            </Link>
          </div>
          <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            {next.map((item) => (
              <TaskCard key={String(item.task._id)} view={item} canMove showProject />
            ))}
          </ul>
        </section>
      )}

      {projects.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Projektjeim</h2>
            <Link href="/projektek" className="text-sm text-volt hover:underline">
              Összes projekt
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.slice(0, 6).map((summary, index) => (
              <ProjectCard key={String(summary.project._id)} summary={summary} index={index} />
            ))}
          </div>
        </section>
      )}

      {activity.length > 0 && (
        <section className="pg-panel rounded-3xl p-5 sm:p-6">
          <h2 className="mb-3 font-display text-lg font-semibold">Legutóbbi tevékenység</h2>
          <ol className="space-y-1">
            {activity.map((entry) => (
              <li key={String(entry._id)} className="flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-white/4">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-volt" aria-hidden />
                <p className="min-w-0 flex-1 text-sm text-white/80">
                  {entry.text} <span className="text-white/35">· {nameOf.get(String(entry.projectId))}</span>
                </p>
                <time dateTime={entry.at.toISOString()} className="shrink-0 text-xs text-white/45">
                  {formatStamp(entry.at)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="flex items-center gap-2 text-xs text-white/40">
        <CircleCheck size={14} aria-hidden className="text-volt" /> A fiókod jelszóval védett; a belépéseidet a Biztonság oldalon látod.
      </p>
    </div>
  );
}

/** Díszítő villám: lüktető, kettős körvonallal. Tisztán vizuális. */
function Bolt() {
  return (
    <svg aria-hidden viewBox="0 0 300 300" className="pointer-events-none absolute top-1/2 right-4 hidden size-72 -translate-y-1/2 md:block lg:right-10 lg:size-80">
      <defs>
        <linearGradient id="pg-bolt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0ffb8" />
          <stop offset="0.55" stopColor="#c6f432" />
          <stop offset="1" stopColor="#ff3d8b" />
        </linearGradient>
      </defs>
      {[130, 98, 66].map((r, index) => (
        <circle key={r} cx="150" cy="150" r={r} fill="none" stroke="#c6f432" strokeOpacity={0.15} strokeDasharray={index === 0 ? "2 7" : undefined} />
      ))}
      <g className="pg-radar-sweep">
        <circle cx="150" cy="20" r="5" fill="#ff3d8b" />
        <circle cx="150" cy="20" r="5" fill="none" stroke="#ff3d8b" className="pg-node-ping" />
      </g>
      <path className="pg-float" d="M168 52 98 160h46l-14 88 72-112h-46Z" fill="url(#pg-bolt)" stroke="#f8ffdc" strokeOpacity="0.6" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <div className="pg-skeleton h-64 rounded-[2rem]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="pg-skeleton h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
