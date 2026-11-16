import type { ReactNode } from "react";
import { FolderKanban, ListChecks, ShieldCheck, UsersRound } from "lucide-react";
import { Backdrop, Brand } from "@/components/brand";

const FEATURES = [
  { icon: FolderKanban, title: "Projektek", text: "Minden kiemelt feladat saját, átlátható térben." },
  { icon: ListChecks, title: "Feladatok", text: "Tábla, felelősök, határidők és megjegyzések egy helyen." },
  { icon: UsersRound, title: "Közös munka", text: "Csak azokat hívod be, akiknek a projektben a helyük van." },
];

/** A belépés, a regisztráció és a meghívó közös kerete. */
export function AuthShell({
  eyebrow,
  title,
  accent,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative grid min-h-dvh overflow-x-clip lg:grid-cols-[minmax(0,32rem)_1fr]">
      <Backdrop />

      <section className="pg-rise relative z-10 flex flex-col justify-center border-white/8 bg-ink-900/80 px-6 py-12 backdrop-blur-xl sm:px-12 lg:border-r">
        <Brand size="lg" />
        <p className="mt-14 text-xs font-semibold tracking-[0.22em] text-volt uppercase">{eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl leading-tight font-semibold tracking-tight">
          {title}
          <br />
          <span className="pg-accent-text">{accent}</span>
        </h1>
        <div className="mt-4 mb-9 text-white/60">{intro}</div>
        {children}
      </section>

      <aside className="relative hidden items-center justify-center p-12 lg:flex">
        <div className="w-full max-w-md space-y-4">
          <div className="pg-panel flex items-center gap-4 rounded-3xl p-6">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-volt/12 text-volt">
              <ShieldCheck size={24} aria-hidden />
            </span>
            <div>
              <p className="font-display text-lg font-semibold">Jogosultság projektenként</p>
              <p className="text-sm text-white/55">
                Mindenki csak azokat a projekteket látja, amelyekbe meghívták.
              </p>
            </div>
          </div>
          {FEATURES.map(({ icon: Icon, title, text }, index) => (
            <div
              key={title}
              className="pg-card pg-rise flex items-center gap-4 rounded-2xl p-5"
              style={{ animationDelay: `${0.15 + index * 0.1}s` }}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ember/20 text-azure">
                <Icon size={19} aria-hidden />
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-white/55">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}
