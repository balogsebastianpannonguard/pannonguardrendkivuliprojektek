import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { createInvite, addMember } from "@/lib/project-invites";
import { PORTAL_URL, isPortal } from "@/lib/mode";
import { appBaseUrl, sendProjectInvite } from "@/lib/project-mail";
import {
  MEMBER_ROLES,
  TASK_PRIORITY,
  TASK_STATUS,
  can,
  commentsCol,
  logActivity,
  membersCol,
  parseId,
  projectAccess,
  projectsCol,
  tasksCol,
  type MemberRole,
  type TaskDocument,
} from "@/lib/projects";
import type { CurrentUser } from "@/lib/session";
import { findUserByEmail } from "@/lib/users";

/**
 * A feladatokat és meghívókat módosító műveletek közös magja. Ugyanezt használja az űrlapok szerverműveletei és az a
 * lépés is, amikor a felhasználó jóváhagy egy Pajzsi-javaslatot, így a jogosultság mindenhol egyformán érvényesül.
 */
type Actor = Pick<CurrentUser, "oid" | "isAdmin" | "name" | "email">;
export type OpResult<T = object> = ({ ok: true } & T) | { ok?: false; error: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(DAY).refine((value) => !Number.isNaN(Date.parse(value)), "Érvénytelen dátum.");

export const taskInput = z.object({
  title: z.string().trim().min(2, "Adj a feladatnak címet (legalább 2 karakter).").max(160),
  description: z.string().trim().max(4000).default(""),
  status: z.enum(Object.keys(TASK_STATUS) as [keyof typeof TASK_STATUS]).default("teendo"),
  priority: z.enum(Object.keys(TASK_PRIORITY) as [keyof typeof TASK_PRIORITY]).default("normal"),
  assigneeId: z.string().regex(/^[0-9a-f]{24}$/i).optional().nullable(),
  dueDate: day.optional().nullable().or(z.literal("")),
});

export type TaskInput = z.infer<typeof taskInput>;

async function assigneeOk(projectId: ObjectId, assigneeId?: string | null) {
  if (!assigneeId) return undefined;
  const oid = parseId(assigneeId);
  if (!oid) return null;
  return (await (await membersCol()).findOne({ projectId, userId: oid })) ? oid : null;
}

export async function createTaskOp(user: Actor, projectId: string, raw: unknown, viaPajzsi = false): Promise<OpResult<{ id: string }>> {
  const access = await projectAccess(user, projectId);
  if (!access || !can.contribute(access.role)) return { error: "Ehhez a projekthez nincs feladat-létrehozási jogosultságod." };
  if (access.project.status === "lezart") return { error: "A projekt le van zárva, nem vehető fel új feladat." };
  const parsed = taskInput.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Hibás adatok." };
  const input = parsed.data;
  const assignee = await assigneeOk(access.project._id, input.assigneeId);
  if (assignee === null) return { error: "A felelős nem tagja a projektnek." };

  const now = new Date();
  const task: TaskDocument = {
    _id: new ObjectId(),
    projectId: access.project._id,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    ...(assignee && { assigneeId: assignee }),
    ...(input.dueDate && { dueDate: input.dueDate }),
    createdBy: user.oid,
    createdAt: now,
    updatedAt: now,
    ...(input.status === "kesz" && { doneAt: now }),
  };
  await (await tasksCol()).insertOne(task);
  await (await projectsCol()).updateOne({ _id: access.project._id }, { $set: { updatedAt: now } });
  await logActivity(access.project._id, user.oid, `${user.name} felvette: „${task.title}”`, viaPajzsi);
  return { ok: true, id: String(task._id) };
}

export const taskPatch = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(4000),
    status: z.enum(Object.keys(TASK_STATUS) as [keyof typeof TASK_STATUS]),
    priority: z.enum(Object.keys(TASK_PRIORITY) as [keyof typeof TASK_PRIORITY]),
    assigneeId: z.string().regex(/^[0-9a-f]{24}$/i).nullable(),
    dueDate: day.nullable().or(z.literal("")),
  })
  .partial();

export async function updateTaskOp(user: Actor, taskId: string, raw: unknown, viaPajzsi = false): Promise<OpResult<{ projectId: string }>> {
  const id = parseId(taskId);
  if (!id) return { error: "A feladat nem található." };
  const task = await (await tasksCol()).findOne({ _id: id });
  if (!task) return { error: "A feladat nem található." };
  const access = await projectAccess(user, task.projectId);
  if (!access || !can.contribute(access.role)) return { error: "Ezt a feladatot nem szerkesztheted." };
  if (access.project.status === "lezart") return { error: "A projekt le van zárva." };
  const parsed = taskPatch.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Hibás adatok." };
  const patch = parsed.data;

  const set: Partial<TaskDocument> = {};
  const unset: Record<string, ""> = {};
  const changes: string[] = [];
  if (patch.title !== undefined && patch.title !== task.title) {
    set.title = patch.title;
    changes.push("címe");
  }
  if (patch.description !== undefined && patch.description !== task.description) {
    set.description = patch.description;
    changes.push("leírása");
  }
  if (patch.priority !== undefined && patch.priority !== task.priority) {
    set.priority = patch.priority;
    changes.push(`prioritása: ${TASK_PRIORITY[patch.priority].label}`);
  }
  if (patch.status !== undefined && patch.status !== task.status) {
    set.status = patch.status;
    if (patch.status === "kesz") set.doneAt = new Date();
    else unset.doneAt = "";
    changes.push(`állapota: ${TASK_STATUS[patch.status].label}`);
  }
  if (patch.assigneeId !== undefined) {
    const assignee = await assigneeOk(access.project._id, patch.assigneeId);
    if (assignee === null) return { error: "A felelős nem tagja a projektnek." };
    if ((assignee?.toString() ?? "") !== (task.assigneeId?.toString() ?? "")) {
      if (assignee) set.assigneeId = assignee;
      else unset.assigneeId = "";
      changes.push("felelőse");
    }
  }
  if (patch.dueDate !== undefined) {
    const due = patch.dueDate || undefined;
    if (due !== task.dueDate) {
      if (due) set.dueDate = due;
      else unset.dueDate = "";
      changes.push("határideje");
    }
  }
  if (!changes.length) return { ok: true, projectId: String(task.projectId) };

  const now = new Date();
  await (await tasksCol()).updateOne({ _id: task._id }, { $set: { ...set, updatedAt: now }, ...(Object.keys(unset).length && { $unset: unset }) });
  await (await projectsCol()).updateOne({ _id: task.projectId }, { $set: { updatedAt: now } });
  await logActivity(task.projectId, user.oid, `${user.name} módosította a(z) „${task.title}” feladatot (${changes.join(", ")})`, viaPajzsi);
  return { ok: true, projectId: String(task.projectId) };
}

export async function deleteTaskOp(user: Actor, taskId: string): Promise<OpResult<{ projectId: string }>> {
  const id = parseId(taskId);
  const task = id ? await (await tasksCol()).findOne({ _id: id }) : null;
  if (!task) return { error: "A feladat nem található." };
  const access = await projectAccess(user, task.projectId);
  const mine = task.createdBy.equals(user.oid);
  if (!access || !(can.manage(access.role) || (mine && can.contribute(access.role)))) return { error: "Ezt a feladatot nem törölheted." };
  await (await tasksCol()).deleteOne({ _id: task._id });
  await (await commentsCol()).deleteMany({ taskId: task._id });
  await logActivity(task.projectId, user.oid, `${user.name} törölte: „${task.title}”`);
  return { ok: true, projectId: String(task.projectId) };
}

export async function addCommentOp(user: Actor, taskId: string, text: string, viaPajzsi = false): Promise<OpResult> {
  const id = parseId(taskId);
  const task = id ? await (await tasksCol()).findOne({ _id: id }) : null;
  if (!task) return { error: "A feladat nem található." };
  const access = await projectAccess(user, task.projectId);
  if (!access || !can.contribute(access.role)) return { error: "Ehhez a feladathoz nem kommentelhetsz." };
  const clean = text.replace(/\r\n/g, "\n").trim().slice(0, 2000);
  if (clean.length < 1) return { error: "Írj be egy megjegyzést." };
  await (await commentsCol()).insertOne({ _id: new ObjectId(), projectId: task.projectId, taskId: task._id, authorId: user.oid, text: clean, createdAt: new Date() });
  await logActivity(task.projectId, user.oid, `${user.name} hozzászólt: „${task.title}”`, viaPajzsi);
  return { ok: true };
}

const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** Meghívó küldése egy címre. Már meglévő tagot nem hív meg újra. A linket a hívónak is visszaadja. */
export async function inviteOp(
  user: Actor,
  projectId: string,
  emailRaw: string,
  role: MemberRole,
  note?: string,
  origin?: string,
  viaPajzsi = false,
): Promise<OpResult<{ link: string; emailed: boolean; addedDirectly?: boolean }>> {
  const access = await projectAccess(user, projectId);
  if (!access || !can.manage(access.role)) return { error: "Tagot csak a projektvezető és az adminisztrátor hívhat meg." };
  if (access.project.status === "lezart") return { error: "A lezárt projektbe nem hívhatsz meg új tagot." };
  const email = emailSchema.safeParse(emailRaw);
  if (!email.success) return { error: `Érvénytelen e-mail-cím: ${emailRaw.slice(0, 60)}` };
  if (!(role in MEMBER_ROLES)) return { error: "Érvénytelen szerep." };

  const existing = await findUserByEmail(email.data);
  if (existing && (await (await membersCol()).findOne({ projectId: access.project._id, userId: existing._id }))) {
    return { error: `${email.data} már tagja a projektnek.` };
  }

  const { token, invite } = await createInvite(access.project, email.data, role, user.oid);
  // A meghívó mindig a munkatársi portálra mutat (az admin felületre a tagok nem léphetnek be).
  const link = `${!isPortal && PORTAL_URL ? PORTAL_URL : appBaseUrl(origin)}/meghivo?token=${token}`;
  const failure = await sendProjectInvite({
    to: email.data,
    link,
    projectName: access.project.name,
    projectEmoji: access.project.emoji,
    role,
    inviterName: user.name,
    note: note?.trim().slice(0, 500) || undefined,
  });
  await logActivity(access.project._id, user.oid, `${user.name} meghívta: ${email.data} (${MEMBER_ROLES[role].label})`, viaPajzsi);
  void invite;
  return { ok: true, link, emailed: !failure };
}

export { addMember };
