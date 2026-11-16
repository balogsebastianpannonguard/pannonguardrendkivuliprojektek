"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { setTaskStatus } from "@/lib/actions/tasks";
import { TASK_STATUS, TASK_STATUS_ORDER, type TaskStatus } from "@/lib/project-meta";

/** Egykattintásos állapotváltás: az előző vagy a következő oszlopba mozgatja a feladatot. */
export function TaskStatusButtons({ taskId, status, disabled = false }: { taskId: string; status: TaskStatus; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const index = TASK_STATUS_ORDER.indexOf(status);
  const prev = TASK_STATUS_ORDER[index - 1];
  const next = TASK_STATUS_ORDER[index + 1];

  const move = (to: TaskStatus) =>
    startTransition(async () => {
      const result = await setTaskStatus(taskId, to);
      setError(result.error);
    });

  if (disabled) return null;
  return (
    <div className="flex items-center gap-1" title={error}>
      <button
        type="button"
        disabled={!prev || pending}
        onClick={() => prev && move(prev)}
        aria-label={prev ? `Vissza: ${TASK_STATUS[prev].label}` : undefined}
        title={prev ? `Vissza: ${TASK_STATUS[prev].label}` : undefined}
        className="grid size-7 place-items-center rounded-lg text-white/45 transition enabled:hover:bg-white/10 enabled:hover:text-white disabled:opacity-25"
      >
        <ChevronLeft size={15} aria-hidden />
      </button>
      {pending && <LoaderCircle size={13} aria-hidden className="animate-spin text-volt" />}
      <button
        type="button"
        disabled={!next || pending}
        onClick={() => next && move(next)}
        aria-label={next ? `Tovább: ${TASK_STATUS[next].label}` : undefined}
        title={next ? `Tovább: ${TASK_STATUS[next].label}` : undefined}
        className="grid size-7 place-items-center rounded-lg bg-volt/10 text-volt transition enabled:hover:bg-volt enabled:hover:text-ink-950 disabled:opacity-25"
      >
        <ChevronRight size={15} aria-hidden />
      </button>
      {error && <span className="text-[0.65rem] text-red-300">{error}</span>}
    </div>
  );
}
