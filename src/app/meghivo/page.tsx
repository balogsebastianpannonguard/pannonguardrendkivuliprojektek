import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CircleAlert, FolderKanban } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { AcceptInvite } from "@/components/accept-invite";
import { RegisterForm } from "@/components/register-form";
import { MEMBER_ROLES } from "@/lib/projects";
import { checkInvite } from "@/lib/project-invites";
import { PORTAL_URL, isPortal } from "@/lib/mode";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUserByEmail, findUserById } from "@/lib/users";

export const metadata: Metadata = { title: "Meghívó" };

const PROBLEMS = {
  invalid: "Ez a meghívó-link nem érvényes. Ellenőrizd, hogy a teljes linket nyitottad-e meg a levélből.",
  expired: "Ez a meghívó lejárt. Kérj újat attól, aki meghívott.",
  used: "Ezt a meghívót már elfogadták. Ha te voltál, egyszerűen lépj be.",
  revoked: "Ezt a meghívót visszavonták. Kérj újat attól, aki meghívott.",
};

export default function InvitePage({ searchParams }: PageProps<"/meghivo">) {
  return (
    <AuthShell
      eyebrow="Meghívó"
      title="Hívtak a csapatba."
      accent="Csatlakozz."
      intro="Meghívtak egy projektbe. A fiókod létrehozása után azonnal látod a projektet és a rád váró feladatokat."
    >
      <Suspense fallback={<div className="pg-skeleton h-96 rounded-2xl" />}>
        <Invitation searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Invitation({ searchParams }: Pick<PageProps<"/meghivo">, "searchParams">) {
  const { token } = await searchParams;
  // A link érvényessége időfüggő, ezért csak kérésidőben ellenőrizhető.
  await connection();
  if (!isPortal) {
    // A meghívót a munkatársi portálon kell megnyitni; az admin felületre a tagok nem léphetnek be.
    if (PORTAL_URL && typeof token === "string") redirect(`${PORTAL_URL}/meghivo?token=${encodeURIComponent(token)}`);
    return (
      <div className="flex gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/8 p-4 text-sm text-amber-100">
        <CircleAlert size={19} aria-hidden className="mt-0.5 shrink-0 text-amber-300" />
        <p>Ezt a meghívót a munkatársi portálon kell megnyitni. Használd a levélben kapott linket.</p>
      </div>
    );
  }
  const check = typeof token === "string" ? await checkInvite(token).catch(() => null) : ({ status: "invalid" } as const);

  if (!check || check.status !== "valid") {
    return (
      <div className="space-y-5">
        <div className="flex gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          <CircleAlert size={19} aria-hidden className="mt-0.5 shrink-0 text-red-300" />
          <p>{check ? PROBLEMS[check.status] : "A meghívó átmenetileg nem érhető el."}</p>
        </div>
        <Link href="/login" className="inline-block text-sm text-volt underline underline-offset-4">
          Tovább a belépéshez
        </Link>
      </div>
    );
  }

  const { invite, project } = check;
  const header = (
    <div className="flex items-center gap-3 rounded-2xl border border-volt/20 bg-volt/8 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt/15 text-lg">{project.emoji || <FolderKanban size={19} aria-hidden />}</span>
      <div className="min-w-0 text-sm">
        <p className="truncate font-semibold">{project.name}</p>
        <p className="truncate text-white/55">
          {invite.email} · {MEMBER_ROLES[invite.role].label}
        </p>
      </div>
    </div>
  );

  const session = await getSession();
  const me = session ? await findUserById(session.userId) : null;
  if (me) {
    if (me.email !== invite.email) {
      return (
        <div className="space-y-5">
          {header}
          <p className="rounded-2xl border border-amber-300/25 bg-amber-300/8 p-4 text-sm text-amber-100">
            Ezt a meghívót a(z) <strong>{invite.email}</strong> címre küldték, te viszont a(z) {me.email} fiókkal vagy belépve. Jelentkezz ki, és lépj be a meghívott címmel.
          </p>
          <Link href="/" className="inline-block text-sm text-volt underline underline-offset-4">
            Vissza a kezdőlapra
          </Link>
        </div>
      );
    }
    return (
      <div className="space-y-5">
        {header}
        <AcceptInvite inviteId={String(invite._id)} />
      </div>
    );
  }

  if (await findUserByEmail(invite.email)) {
    const next = `/meghivo?token=${encodeURIComponent(String(token))}`;
    return (
      <div className="space-y-5">
        {header}
        <p className="text-sm text-white/65">Ezzel az e-mail-címmel már van fiókod. Lépj be, és fogadd el a meghívót.</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="pg-button inline-flex h-12 items-center rounded-xl px-6 font-semibold">
          Belépés
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <RegisterForm token={String(token)} mode="join" />
    </div>
  );
}
