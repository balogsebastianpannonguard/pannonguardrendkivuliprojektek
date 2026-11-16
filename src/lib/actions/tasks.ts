"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { longText, text, type FormState } from "@/lib/form";
import { addCommentOp, createTaskOp, deleteTaskOp, updateTaskOp } from "@/lib/task-ops";
import { requireUser } from "@/lib/session";

function refresh(projectId: string, taskId?: string) {
  revalidatePath(`/projektek/${projectId}`);
  if (taskId) revalidatePath(`/projektek/${projectId}/feladat/${taskId}`);
  revalidatePath("/feladataim");
  revalidatePath("/");
}

const optionalId = (formData: FormData, name: string) => String(formData.get(name) ?? "") || null;

export async function createTask(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  const result = await createTaskOp(user, projectId, {
    title: text(formData, "title", 160),
    description: longText(formData, "description", 4000),
    status: String(formData.get("status") || "teendo"),
    priority: String(formData.get("priority") || "normal"),
    assigneeId: optionalId(formData, "assigneeId"),
    dueDate: String(formData.get("dueDate") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  refresh(projectId);
  return { ok: true, message: "Feladat felvéve.", id: result.id };
}

export async function updateTask(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const taskId = String(formData.get("taskId") ?? "");
  const result = await updateTaskOp(user, taskId, {
    title: text(formData, "title", 160),
    description: longText(formData, "description", 4000),
    status: String(formData.get("status") ?? ""),
    priority: String(formData.get("priority") ?? ""),
    assigneeId: optionalId(formData, "assigneeId"),
    dueDate: String(formData.get("dueDate") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  refresh(result.projectId, taskId);
  return { ok: true, message: "Mentve." };
}

/** Állapotváltás egy kattintással (a táblán és a feladatlistán). */
export async function setTaskStatus(taskId: string, status: string): Promise<FormState> {
  const user = await requireUser();
  const result = await updateTaskOp(user, taskId, { status });
  if (!result.ok) return { error: result.error };
  refresh(result.projectId, taskId);
  return { ok: true };
}

export async function deleteTask(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await deleteTaskOp(user, String(formData.get("taskId") ?? ""));
  if (!result.ok) return { error: result.error };
  refresh(result.projectId);
  redirect(`/projektek/${result.projectId}`);
}

export async function addComment(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const taskId = String(formData.get("taskId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const result = await addCommentOp(user, taskId, longText(formData, "text", 2000));
  if (!result.ok) return { error: result.error };
  refresh(projectId, taskId);
  return { ok: true };
}
