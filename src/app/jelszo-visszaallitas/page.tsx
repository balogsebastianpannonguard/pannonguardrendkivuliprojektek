import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CircleAlert, KeyRound } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { checkLocalReset } from "@/lib/auth-actions";
import { checkResetToken } from "@/lib/invitations";

export const metadata: Metadata = { title: "Új jelszó beállítása" };

const PROBLEMS = {
  invalid: "Ez a link nem érvényes vagy már felhasználták. Ellenőrizd, hogy a teljes linket nyitottad-e meg a levélből.",
  expired: "Ez a link lejárt. Kérj új jelszó-visszaállító linket az adminisztrátortól.",
  revoked: "A hozzáférésedet visszavonták. Fordulj az adminisztrátorhoz.",
};

export default function ResetPage({ searchParams }: PageProps<"/jelszo-visszaallitas">) {
  return (
    <AuthShell
      eyebrow="Jelszó-visszaállítás"
      title="Új jelszó."
      accent="Gyorsan és biztonságosan."
      intro="Adj meg egy új, erős jelszót. A mentés után minden korábbi munkamenetedből kijelentkeztetünk."
    >
      <Suspense fallback={<div className="pg-skeleton h-80 rounded-2xl" />}>
        <Reset searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Reset({ searchParams }: Pick<PageProps<"/jelszo-visszaallitas">, "searchParams">) {
  const { token } = await searchParams;
  // A link érvényessége időfüggő, ezért csak kérésidőben ellenőrizhető.
  await connection();
  const check =
    typeof token === "string"
      ? await (async () => {
          const local = await checkLocalReset(token);
          if (local.status === "valid") return local;
          return checkResetToken(token);
        })().catch(() => null)
      : ({ status: "invalid" } as const);

  if (!check || check.status !== "valid") {
    return (
      <div className="space-y-5">
        <div className="flex gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          <CircleAlert size={19} aria-hidden className="mt-0.5 shrink-0 text-red-300" />
          <p>{check ? PROBLEMS[check.status] : "A jelszó-visszaállítás átmenetileg nem érhető el."}</p>
        </div>
        <Link href="/login" className="inline-block text-sm text-volt underline underline-offset-4">
          Tovább a belépéshez
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl border border-volt/20 bg-volt/8 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt/15 text-volt">
          <KeyRound size={19} aria-hidden />
        </span>
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold">{check.email}</p>
          <p className="text-white/55">Rendkívüli projekt · egyszer használható link</p>
        </div>
      </div>
      <ResetPasswordForm token={typeof token === "string" ? token : ""} />
    </div>
  );
}
