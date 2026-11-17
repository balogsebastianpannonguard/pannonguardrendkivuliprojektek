"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, LoaderCircle, Undo2, X } from "lucide-react";
import { Feedback, Input, buttonClass } from "@/components/ui";
import { approveRequest, rejectRequest, withdrawRequest } from "@/lib/actions/requests";
import type { FormState } from "@/lib/form";

/** Admin: jóváhagyás vagy elutasítás (opcionális indoklással). */
export function RequestDecision({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<FormState>();
  const [pending, startTransition] = useTransition();

  const run = (job: () => Promise<FormState>) =>
    startTransition(async () => {
      const outcome = await job();
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });

  return (
    <div className="space-y-3">
      <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Indoklás elutasításhoz (nem kötelező)" aria-label="Indoklás" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={() => run(() => approveRequest(requestId))} className={buttonClass("primary")}>
          {pending ? <LoaderCircle size={17} aria-hidden className="animate-spin" /> : <Check size={17} aria-hidden />} Jóváhagyás
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => rejectRequest(requestId, note))} className={buttonClass("ghost")}>
          <X size={17} aria-hidden /> Elutasítás
        </button>
        <Feedback error={result?.error} message={result?.ok ? result.message : undefined} />
      </div>
    </div>
  );
}

/** Kérelmező: a még el nem bírált kérvény visszavonása. */
export function WithdrawButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await withdrawRequest(requestId);
            if (outcome.error) setError(outcome.error);
            else router.refresh();
          })
        }
        className={buttonClass("ghost", "sm")}
      >
        {pending ? <LoaderCircle size={15} aria-hidden className="animate-spin" /> : <Undo2 size={15} aria-hidden />} Visszavonom
      </button>
      <Feedback error={error} />
    </div>
  );
}
