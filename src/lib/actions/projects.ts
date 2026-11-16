"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DAY, longText, text, type FormState } from "@/lib/form";
import {
  activityCol,
  can,
  commentsCol,
  ensureIndexes,
  invitesCol,
  isProjectStatus,
  logActivity,
  membersCol,
  projectAccess,
  projectsCol,
  tasksCol,
  type ProjectDocument,
} from "@/lib/projects";
import { requireUser } from "@/lib/session";

/** Új projekt; csak az adminisztrátor hozhat létre. A létrehozó automatikusan projektvezető. */
export async function createProject(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isAdmin) return { error: "Projektet csak az adminisztrátor hozhat létre." };
  const name = text(formData, "name", 100);
  const description = longText(formData, "description", 2000);
  const dueDate = String(formData.get("dueDate") ?? "");
  const emoji = (String(formData.get("emoji") ?? "").trim().slice(0, 8)) || "🚀";
  if (name.length < 3) return { error: "Adj a projektnek nevet (legalább 3 karakter)." };
  if (dueDate && !DAY.test(dueDate)) return { error: "A határidő formátuma hibás." };

  await ensureIndexes().catch(() => undefined);
  const now = new Date();
  const project: ProjectDocument = {
    _id: new ObjectId(),
    name,
    description,
    status: "aktiv",
    ...(dueDate && { dueDate }),
    emoji,
    ownerId: user.oid,
    createdAt: now,
    updatedAt: now,
  };
  await (await projectsCol()).insertOne(project);
  await (await membersCol()).insertOne({ _id: new ObjectId(), projectId: project._id, userId: user.oid, role: "vezeto", addedBy: user.oid, addedAt: now });
  await logActivity(project._id, user.oid, `${user.name} létrehozta a projektet`);
  revalidatePath("/projektek");
  revalidatePath("/");
  redirect(`/projektek/${project._id}?udv=uj`);
}

export async function updateProject(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const access = await projectAccess(user, String(formData.get("projectId") ?? ""));
  if (!access || !can.manage(access.role)) return { error: "A projektet csak a projektvezető módosíthatja." };
  const name = text(formData, "name", 100);
  const description = longText(formData, "description", 2000);
  const dueDate = String(formData.get("dueDate") ?? "");
  const status = String(formData.get("status") ?? "");
  const emoji = (String(formData.get("emoji") ?? "").trim().slice(0, 8)) || access.project.emoji;
  if (name.length < 3) return { error: "Adj a projektnek nevet (legalább 3 karakter)." };
  if (dueDate && !DAY.test(dueDate)) return { error: "A határidő formátuma hibás." };
  if (!isProjectStatus(status)) return { error: "Érvénytelen állapot." };

  const set: Partial<ProjectDocument> = { name, description, status, emoji, updatedAt: new Date() };
  if (dueDate) set.dueDate = dueDate;
  await (await projectsCol()).updateOne({ _id: access.project._id }, { $set: set, ...(dueDate ? {} : { $unset: { dueDate: "" } }) });
  if (status !== access.project.status) await logActivity(access.project._id, user.oid, `${user.name} az állapotot átállította: ${status}`);
  revalidatePath(`/projektek/${access.project._id}`);
  revalidatePath("/projektek");
  revalidatePath("/");
  return { ok: true, message: "Mentve." };
}

/** Végleges törlés minden kapcsolódó adattal; csak az adminisztrátor, a projekt nevének beírásával. */
export async function deleteProject(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isAdmin) return { error: "Projektet csak az adminisztrátor törölhet." };
  const access = await projectAccess(user, String(formData.get("projectId") ?? ""));
  if (!access) return { error: "A projekt nem található." };
  if (String(formData.get("confirm") ?? "").trim() !== access.project.name) return { error: "A megerősítéshez írd be pontosan a projekt nevét." };
  const id = access.project._id;
  await Promise.all([
    (await tasksCol()).deleteMany({ projectId: id }),
    (await commentsCol()).deleteMany({ projectId: id }),
    (await membersCol()).deleteMany({ projectId: id }),
    (await invitesCol()).deleteMany({ projectId: id }),
    (await activityCol()).deleteMany({ projectId: id }),
  ]);
  await (await projectsCol()).deleteOne({ _id: id });
  revalidatePath("/projektek");
  revalidatePath("/");
  redirect("/projektek");
}
