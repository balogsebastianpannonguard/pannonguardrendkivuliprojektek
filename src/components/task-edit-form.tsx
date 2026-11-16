"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Save, Trash2 } from "lucide-react";
import { Feedback, Input, Label, Select, Textarea, buttonClass } from "@/components/ui";
import { useKeepForm } from "@/components/use-keep-form";
import { deleteTask, updateTask } from "@/lib/actions/tasks";
import type { FormState } from "@/lib/form";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/project-meta";
import type { PersonOption } from "@/components/task-form";

export function TaskEditForm({
  task,
  people,
  canEdit,
  canDelete,
}: {
  task: { id: string; title: string; description: string; status: string; priority: string; assigneeId?: string; dueDate?: string };
  people: PersonOption[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateTask, {});
  const { ref, onSubmit } = useKeepForm(action, state);
  const [removeState, removeAction, removing] = useActionState<FormState, FormData>(deleteTask, {});
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-4">
      <form ref={ref} onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="taskId" value={task.id} />
        <fieldset disabled={!canEdit} className="space-y-4">
          <Label label="Cím">
            <Input name="title" required minLength={2} maxLength={160} defaultValue={task.title} />
          </Label>
          <Label label="Részletek">
            <Textarea name="description" maxLength={4000} rows={5} defaultValue={task.description} />
          </Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label label="Állapot">
              <Select name="status" defaultValue={task.status}>
                {Object.entries(TASK_STATUS).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Label>
            <Label label="Prioritás">
              <Select name="priority" defaultValue={task.priority}>
                {Object.entries(TASK_PRIORITY).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Label>
            <Label label="Felelős">
              <Select name="assigneeId" defaultValue={task.assigneeId ?? ""}>
                <option value="">Nincs kijelölve</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Label>
            <Label label="Határidő">
              <Input name="dueDate" type="date" defaultValue={task.dueDate} />
            </Label>
          </div>
        </fieldset>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {pending ? <LoaderCircle size={17} aria-hidden className="animate-spin" /> : <Save size={17} aria-hidden />} Mentés
            </button>
            <Feedback error={state.error} message={state.ok ? state.message : undefined} />
          </div>
        )}
      </form>

      {canDelete && (
        <form action={removeAction} className="border-t border-white/8 pt-4">
          <input type="hidden" name="taskId" value={task.id} />
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className={buttonClass("ghost", "sm")}>
              <Trash2 size={15} aria-hidden /> Feladat törlése
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-white/65">Biztosan törlöd a feladatot és a hozzászólásait?</span>
              <button type="submit" disabled={removing} className={buttonClass("danger", "sm")}>
                Igen, törlöm
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={buttonClass("ghost", "sm")}>
                Mégsem
              </button>
              <Feedback error={removeState.error} />
            </div>
          )}
        </form>
      )}
    </div>
  );
}
