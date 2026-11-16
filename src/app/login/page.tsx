import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Belépés" };

const NOTICES: Record<string, string> = {
  kilepve: "Sikeresen kijelentkeztél.",
  mindenhol: "Minden eszközön kijelentkeztél.",
  visszavonva: "A hozzáférésedet visszavonták vagy letiltották. Fordulj az adminisztrátorhoz.",
  jelszocsere: "Az új jelszavad be van állítva. Lépj be vele.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell
      eyebrow="Belépés"
      title="Rendkívüli feladatok,"
      accent="rendkívüli csapat."
      intro="Lépj be az e-mail-címeddel és a jelszavaddal, és folytasd ott, ahol abbahagytad."
    >
      <Suspense fallback={<LoginForm />}>
        <LoginWithNotice searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginWithNotice({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { ok, next } = await searchParams;
  return <LoginForm notice={typeof ok === "string" ? NOTICES[ok] : undefined} next={typeof next === "string" ? next : undefined} />;
}
