import type { Metadata } from "next";
import { Suspense } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { ProjectCard } from "@/components/project-card";
import { ProjectForm } from "@/components/project-form";
import { Empty, Panel, Skeleton } from "@/components/ui";
import { LinkButton } from "@/components/ui";
import { listProjects } from "@/lib/projects";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Projektek" };

export default function ProjectsPage() {
  return (
    <div className="space-y-8">
      <PageTitle eyebrow="Projektek" title="Minden rendkívüli feladat" accent="egy helyen.">
        Itt látod azokat a projekteket, amelyekben részt veszel. Új projektet az adminisztrátor hozhat létre; mindenki más kérvényezheti, és a jóváhagyás után ő lesz a projekt vezetője.
      </PageTitle>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Projects />
      </Suspense>
    </div>
  );
}

async function Projects() {
  const user = await requireUser();
  const projects = await listProjects(user);
  const active = projects.filter((item) => item.project.status !== "lezart");
  const closed = projects.filter((item) => item.project.status === "lezart");

  return (
    <div className="space-y-8">
      {user.isAdmin ? (
        <Panel title="Új projekt" icon={Plus}>
          <ProjectForm />
        </Panel>
      ) : (
        projects.length > 0 && (
          <div className="flex justify-end">
            <LinkButton href="/kervenyek" variant="secondary">
              <Plus size={17} aria-hidden /> Új projekt kérvényezése
            </LinkButton>
          </div>
        )
      )}

      {projects.length === 0 ? (
        <Empty
          icon={FolderKanban}
          title="Még nincs projekted"
          text={user.isAdmin ? "Hozd létre az elsőt a fenti űrlappal, utána meghívhatod a csapatot." : "Kérvényezz projektindítást, vagy várd meg, amíg meghívnak egy projektbe."}
          action={user.isAdmin ? undefined : <LinkButton href="/kervenyek">Projekt kérvényezése</LinkButton>}
        />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((summary, index) => (
              <ProjectCard key={String(summary.project._id)} summary={summary} index={index} />
            ))}
          </section>
          {closed.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-semibold text-white/70">Lezárt projektek</h2>
              <div className="grid gap-4 opacity-75 sm:grid-cols-2 xl:grid-cols-3">
                {closed.map((summary, index) => (
                  <ProjectCard key={String(summary.project._id)} summary={summary} index={index} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
