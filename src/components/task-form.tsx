"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { Feedback, Input, Label, Select, Textarea, buttonClass } from "@/components/ui";
import { useKeepForm } from "@/components/use-keep-form";
import { createTask } from "@/lib/actions/tasks";
import type { FormState } from "@/lib/form";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/project-meta";

export type PersonOption = { id: string; name: string };

/** Új feladat felvétele: összecsukható, hogy a tábla maradjon a főszereplő. */
export function TaskForm({ projectId, people, defaultStatus = "teendo" }: { projectId: string; people: PersonOption[]; defaultStatus?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(createTask, {});
  const { ref, onSubmit } = useKeepForm(action, state, { resetOnOk: true });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <Plus size={17} aria-hidden /> Új feladat
      </button>
    );
  }
  return (
    <form ref={ref} onSubmit={onSubmit} className="pg-panel pg-rise w-full space-y-4 rounded-3xl p-5">
      <input type="hidden" name="projectId" value={projectId} />
      <Label label="Feladat címe">
        <Input name="title" required minLength={2} maxLength={160} autoFocus placeholder="Mit kell elvégezni?" />
      </Label>
      <Label label="Részletek" hint="Nem kötelező">
        <Textarea name="description" maxLength={4000} rows={3} />
      </Label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Label label="Felelős">
          <Select name="assigneeId" defaultValue="">
            <option value="">Nincs kijelölve</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Label>
        <Label label="Állapot">
          <Select name="status" defaultValue={defaultStatus}>
            {Object.entries(TASK_STATUS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Label>
        <Label label="Prioritás">
          <Select name="priority" defaultValue="normal">
            {Object.entries(TASK_PRIORITY).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Label>
        <Label label="Határidő">
          <Input name="dueDate" type="date" />
        </Label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <LoaderCircle size={17} aria-hidden className="animate-spin" /> : <Plus size={17} aria-hidden />} Felvétel
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Bezár
        </button>
        <Feedback error={state.error} message={state.ok ? state.message : undefined} />
      </div>
    </form>
  );
}
