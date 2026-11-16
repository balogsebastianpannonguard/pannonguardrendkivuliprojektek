import type { Metadata } from "next";
import { Suspense } from "react";
import { MailPlus } from "lucide-react";
import { AcceptInvite } from "@/components/accept-invite";
import { PageTitle } from "@/components/page-title";
import { Empty, Panel, Pill, Skeleton } from "@/components/ui";
import { formatStamp } from "@/lib/dates";
import { pendingInvitesFor } from "@/lib/project-invites";
import { MEMBER_ROLES } from "@/lib/projects";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Meghívásaim" };

export default function InvitationsPage() {
  return (
    <div className="space-y-8">
      <PageTitle eyebrow="Meghívásaim" title="Hová hívtak" accent="meg?">
        Itt látod azokat a projekteket, amelyekbe meghívtak, és még nem fogadtad el.
      </PageTitle>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Invitations />
      </Suspense>
    </div>
  );
}

async function Invitations() {
  const user = await requireUser();
  const pending = await pendingInvitesFor(user.email);
  if (!pending.length) return <Empty icon={MailPlus} title="Nincs függő meghívás" text="Ha valaki meghív egy projektbe, itt fogod látni." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {pending.map(({ invite, project }) => (
        <Panel key={String(invite._id)}>
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/6 text-2xl ring-1 ring-white/10">{project.emoji}</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold [overflow-wrap:anywhere]">{project.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                <Pill tone="info">{MEMBER_ROLES[invite.role].label}</Pill> lejár: {formatStamp(invite.expiresAt)}
              </div>
              {project.description && <p className="mt-2 line-clamp-3 text-sm text-white/60">{project.description}</p>}
              <div className="mt-4">
                <AcceptInvite inviteId={String(invite._id)} label="Elfogadom" />
              </div>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
