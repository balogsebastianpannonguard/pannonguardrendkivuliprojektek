import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { isPortal } from "@/lib/mode";

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
      title={isPortal ? "Üdv a csapatban," : "Rendkívüli feladatok,"}
      accent={isPortal ? "dolgozzunk együtt." : "rendkívüli csapat."}
      intro={
        isPortal
          ? "Lépj be az e-mail-címeddel és a jelszavaddal, és nézd meg a projektjeidet és a rád váró feladatokat."
          : "Lépj be az e-mail-címeddel és a jelszavaddal, és folytasd ott, ahol abbahagytad."
      }
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
