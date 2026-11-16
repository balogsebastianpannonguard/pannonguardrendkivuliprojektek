"use client";

import { useActionState, useState } from "react";
import { Check, Copy, LoaderCircle, MailPlus } from "lucide-react";
import { Feedback, Label, Select, Textarea, buttonClass } from "@/components/ui";
import { useKeepForm } from "@/components/use-keep-form";
import { inviteMembers, type InviteState } from "@/lib/actions/members";
import { MEMBER_ROLES } from "@/lib/project-meta";

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {}
      }}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-volt hover:underline"
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied ? "Másolva" : "Link másolása"}
    </button>
  );
}

/** Tagok meghívása e-mail-címmel; az eredmény soronként látszik, a link kézzel is továbbítható. */
export function InviteForm({ projectId, allowLeader = true }: { projectId: string; allowLeader?: boolean }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMembers, {});
  const { ref, onSubmit } = useKeepForm(action, state, { resetOnOk: true });

  return (
    <div className="space-y-4">
      <form ref={ref} onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="projectId" value={projectId} />
        <Label label="E-mail-címek" hint="Többet is megadhatsz, vesszővel vagy új sorban elválasztva.">
          <Textarea name="emails" required rows={2} placeholder="nev@pannonguard.hu, masik@pannonguard.hu" />
        </Label>
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <Label label="Szerep">
            <Select name="role" defaultValue="tag">
              {Object.entries(MEMBER_ROLES)
                .filter(([key]) => allowLeader || key !== "vezeto")
                .map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </Select>
          </Label>
          <Label label="Üzenet" hint="Nem kötelező; a meghívó levélben jelenik meg.">
            <Textarea name="note" rows={2} maxLength={500} className="min-h-11" />
          </Label>
        </div>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <LoaderCircle size={17} aria-hidden className="animate-spin" /> : <MailPlus size={17} aria-hidden />} Meghívók küldése
        </button>
        <Feedback error={state.error} />
      </form>

      {state.results && (
        <ul className="space-y-2">
          {state.results.map((result) => (
            <li key={result.email} className={`rounded-xl border px-3.5 py-2.5 text-sm ${result.ok ? "border-volt/25 bg-volt/8" : "border-red-400/25 bg-red-500/10"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{result.email}</span>
                {result.link && <CopyLink link={result.link} />}
              </div>
              <p className={`text-xs ${result.ok ? "text-white/60" : "text-red-200"}`}>{result.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
