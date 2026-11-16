"use client";

import { useActionState } from "react";
import { LoaderCircle, Plus, Save } from "lucide-react";
import { Feedback, Input, Label, Select, Textarea, buttonClass } from "@/components/ui";
import { useKeepForm } from "@/components/use-keep-form";
import { createProject, updateProject } from "@/lib/actions/projects";
import type { FormState } from "@/lib/form";
import { PROJECT_STATUS } from "@/lib/project-meta";

const EMOJIS = ["🚀", "⚡", "🛡️", "🏗️", "📦", "🎯", "🔧", "📡", "🧩", "🔥", "🌍", "🧪"];

export function ProjectForm({
  project,
}: {
  project?: { id: string; name: string; description: string; status: string; dueDate?: string; emoji: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(project ? updateProject : createProject, {});
  const { ref, onSubmit } = useKeepForm(action, state);

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4">
      {project && <input type="hidden" name="projectId" value={project.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Label label="Projekt neve">
          <Input name="name" required minLength={3} maxLength={100} defaultValue={project?.name} placeholder="pl. Új központi diszpécserterem" />
        </Label>
        <Label label="Jelkép">
          <Select name="emoji" defaultValue={project?.emoji ?? "🚀"}>
            {[...new Set([project?.emoji, ...EMOJIS].filter(Boolean) as string[])].map((emoji) => (
              <option key={emoji} value={emoji}>
                {emoji}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      <Label label="Leírás" hint="Mi a cél, mi a kerete? (nem kötelező)">
        <Textarea name="description" maxLength={2000} defaultValue={project?.description} rows={3} />
      </Label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label label="Határidő" hint="Nem kötelező">
          <Input name="dueDate" type="date" defaultValue={project?.dueDate} />
        </Label>
        {project && (
          <Label label="Állapot">
            <Select name="status" defaultValue={project.status}>
              {Object.entries(PROJECT_STATUS).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <LoaderCircle size={17} aria-hidden className="animate-spin" /> : project ? <Save size={17} aria-hidden /> : <Plus size={17} aria-hidden />}
          {project ? "Mentés" : "Projekt létrehozása"}
        </button>
        <Feedback error={state.error} message={state.ok ? state.message : undefined} />
      </div>
    </form>
  );
}
