import type { Metadata } from "next";
import { Suspense } from "react";
import { PartyPopper } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { TaskCard, type TaskView } from "@/components/task-card";
import { Empty, Skeleton } from "@/components/ui";
import { loadMyTasks } from "@/lib/my-tasks";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Feladataim" };

export default function MyTasksPage() {
  return (
    <div className="space-y-8">
      <PageTitle eyebrow="Feladataim" title="Ami" accent="rád vár.">
        Az összes projektből ide gyűlnek azok a nyitott feladatok, amelyeknek te vagy a felelőse.
      </PageTitle>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <MyTasks />
      </Suspense>
    </div>
  );
}

async function MyTasks() {
  const user = await requireUser();
  const { groups, total } = await loadMyTasks(user);
  if (!total) {
    return <Empty icon={PartyPopper} title="Nincs nyitott feladatod" text="Ha valaki rád oszt egy feladatot, itt fog megjelenni." />;
  }
  return (
    <div className="space-y-8">
      {groups.map(({ key, label, tone, items }) =>
        items.length ? (
          <section key={key}>
            <h2 className={`mb-3 flex items-center gap-2 font-display text-lg font-semibold ${tone}`}>
              {label} <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs font-normal text-white/55">{items.length}</span>
            </h2>
            <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item: TaskView) => (
                <TaskCard key={String(item.task._id)} view={item} canMove showProject />
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
