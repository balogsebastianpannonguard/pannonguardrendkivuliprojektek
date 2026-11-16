"use client";

import { useActionState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { Feedback, Textarea, buttonClass } from "@/components/ui";
import { useKeepForm } from "@/components/use-keep-form";
import { addComment } from "@/lib/actions/tasks";
import type { FormState } from "@/lib/form";

export function CommentForm({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addComment, {});
  const { ref, onSubmit } = useKeepForm(action, state, { resetOnOk: true });
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Textarea name="text" required maxLength={2000} rows={3} placeholder="Írj egy megjegyzést…" aria-label="Megjegyzés" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
          {pending ? <LoaderCircle size={15} aria-hidden className="animate-spin" /> : <Send size={15} aria-hidden />} Küldés
        </button>
        <Feedback error={state.error} />
      </div>
    </form>
  );
}
