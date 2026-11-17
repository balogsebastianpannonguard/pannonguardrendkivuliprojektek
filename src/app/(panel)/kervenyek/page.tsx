import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardList, Send } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { RequestForm } from "@/components/request-form";
import { RequestDecision, WithdrawButton } from "@/components/request-actions";
import { Empty, Panel, Pill, Skeleton } from "@/components/ui";
import { formatStamp } from "@/lib/dates";
import { REQUEST_STATUS } from "@/lib/project-meta";
import { requestsCol, type ProjectRequestDocument } from "@/lib/project-requests";
import { requireUser } from "@/lib/session";
import { findUsersByIds } from "@/lib/users";

export const metadata: Metadata = { title: "Kérvények" };

export default function RequestsPage() {
  return (
    <div className="space-y-8">
      <PageTitle eyebrow="Kérvények" title="Projektindítás" accent="kérvényezése">
        Új projektet az adminisztrátor jóváhagyásával lehet indítani. A jóváhagyás után a kérelmező lesz a projekt vezetője, és ő hívhat meg másokat.
      </PageTitle>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Requests />
      </Suspense>
    </div>
  );
}

async function Requests() {
  const user = await requireUser();
  const collection = await requestsCol();

  if (user.isAdmin) {
    const [pending, decided] = await Promise.all([
      collection.find({ status: "fuggo" }).sort({ createdAt: 1 }).toArray(),
      collection.find({ status: { $ne: "fuggo" } }).sort({ decidedAt: -1, createdAt: -1 }).limit(30).toArray(),
    ]);
    const people = await findUsersByIds([...new Set([...pending, ...decided].map((item) => item.requesterId))]);
    const nameOf = new Map(people.map((person) => [String(person._id), `${person.name} (${person.email})`]));

    return (
      <div className="space-y-8">
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Elbírálásra vár ({pending.length})</h2>
          {pending.length === 0 ? (
            <Empty icon={ClipboardList} title="Nincs függő kérvény" text="Ha valaki projektindítást kér, itt fogod látni." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pending.map((item) => (
                <Panel key={String(item._id)}>
                  <RequestSummary item={item} who={nameOf.get(String(item.requesterId)) ?? "Ismeretlen felhasználó"} />
                  <div className="mt-4">
                    <RequestDecision requestId={String(item._id)} />
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>
        {decided.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-display text-lg font-semibold text-white/70">Korábbi kérvények</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {decided.map((item) => (
                <Panel key={String(item._id)}>
                  <RequestSummary item={item} who={nameOf.get(String(item.requesterId)) ?? "Ismeretlen felhasználó"} />
                </Panel>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  const mine = await collection.find({ requesterId: user.oid }).sort({ createdAt: -1 }).limit(30).toArray();
  return (
    <div className="space-y-8">
      <Panel title="Új kérvény" icon={Send}>
        <RequestForm />
      </Panel>
      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Kérvényeid</h2>
        {mine.length === 0 ? (
          <Empty icon={ClipboardList} title="Még nem kértél projektet" text="Töltsd ki a fenti űrlapot, és az adminisztrátor elbírálja." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {mine.map((item) => (
              <Panel key={String(item._id)}>
                <RequestSummary item={item} />
                {item.status === "fuggo" && (
                  <div className="mt-4">
                    <WithdrawButton requestId={String(item._id)} />
                  </div>
                )}
                {item.status === "jovahagyva" && item.projectId && (
                  <Link href={`/projektek/${item.projectId}`} className="mt-4 inline-block text-sm text-volt hover:underline">
                    Megnyitom a projektet
                  </Link>
                )}
              </Panel>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RequestSummary({ item, who }: { item: ProjectRequestDocument; who?: string }) {
  const status = REQUEST_STATUS[item.status];
  return (
    <div className="flex items-start gap-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/6 text-2xl ring-1 ring-white/10">{item.emoji}</span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg font-semibold [overflow-wrap:anywhere]">{item.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
          <Pill tone={status.tone}>{status.label}</Pill>
          {who && <span>{who}</span>}
          <span>beküldve: {formatStamp(item.createdAt)}</span>
          {item.dueDate && <span>kért határidő: {item.dueDate}</span>}
        </div>
        <p className="mt-2 text-sm whitespace-pre-line text-white/65 [overflow-wrap:anywhere]">{item.description}</p>
        {item.decisionNote && <p className="mt-2 text-sm text-white/80">Indoklás: {item.decisionNote}</p>}
      </div>
    </div>
  );
}
