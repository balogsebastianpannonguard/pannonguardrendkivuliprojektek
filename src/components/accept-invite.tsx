"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { acceptInvite } from "@/lib/auth-actions";

export function AcceptInvite({ inviteId, label = "Meghívás elfogadása" }: { inviteId: string; label?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvite(inviteId);
            if (result.error) setError(result.error);
            else router.push(`/projektek/${result.projectId}?udv=1`);
          })
        }
        className="pg-button inline-flex h-12 items-center gap-2 rounded-xl px-6 font-semibold disabled:opacity-60"
      >
        {pending ? <LoaderCircle size={18} aria-hidden className="animate-spin" /> : <Check size={18} aria-hidden />} {label}
      </button>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
