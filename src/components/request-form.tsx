"use client";

import { useActionState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { Feedback, Input, Label, Select, Textarea, buttonClass } from "@/components/ui";
import { useKeepForm } from "@/components/use-keep-form";
import { submitProjectRequest } from "@/lib/actions/requests";
import type { FormState } from "@/lib/form";

const EMOJIS = ["🚀", "⚡", "🛡️", "🏗️", "📦", "🎯", "🔧", "📡", "🧩", "🔥", "🌍", "🧪"];

export function RequestForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(submitProjectRequest, {});
  const { ref, onSubmit } = useKeepForm(action, state, { resetOnOk: true });

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Label label="Projekt neve">
          <Input name="name" required minLength={3} maxLength={100} placeholder="pl. Új központi diszpécserterem" />
        </Label>
        <Label label="Jelkép">
          <Select name="emoji" defaultValue="🚀">
            {EMOJIS.map((emoji) => (
              <option key={emoji} value={emoji}>
                {emoji}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      <Label label="Mi a cél, és miért kell a projekt?" hint="Ez alapján bírálja el az adminisztrátor.">
        <Textarea name="description" required minLength={10} maxLength={2000} rows={4} />
      </Label>
      <Label label="Kért határidő" hint="Nem kötelező">
        <Input name="dueDate" type="date" />
      </Label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <LoaderCircle size={17} aria-hidden className="animate-spin" /> : <Send size={17} aria-hidden />}
          Kérvény beküldése
        </button>
        <Feedback error={state.error} message={state.ok ? state.message : undefined} />
      </div>
    </form>
  );
}
