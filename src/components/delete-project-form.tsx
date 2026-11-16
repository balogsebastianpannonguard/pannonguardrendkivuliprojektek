"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Feedback, Input, Label, buttonClass } from "@/components/ui";
import { deleteProject } from "@/lib/actions/projects";
import type { FormState } from "@/lib/form";

export function DeleteProjectForm({ projectId, name }: { projectId: string; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteProject, {});
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-red-400/25 bg-red-500/5 p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="text-sm text-white/65">
        A projekt törlése végleges: a feladatok, hozzászólások, tagságok és meghívók is elvesznek. Megerősítésként írd be a projekt nevét:
        <strong className="text-white"> {name}</strong>
      </p>
      <Label label="Projekt neve">
        <Input name="confirm" required autoComplete="off" />
      </Label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("danger")}>
          <Trash2 size={16} aria-hidden /> Projekt végleges törlése
        </button>
        <Feedback error={state.error} />
      </div>
    </form>
  );
}
