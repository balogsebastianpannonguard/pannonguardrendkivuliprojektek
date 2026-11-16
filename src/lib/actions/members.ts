"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { issueLocalReset } from "@/lib/auth-actions";
import { type FormState } from "@/lib/form";
import { PORTAL_URL, isPortal } from "@/lib/mode";
import { appBaseUrl } from "@/lib/project-mail";
import {
  MEMBER_ROLES,
  can,
  invitesCol,
  isMemberRole,
  logActivity,
  membersCol,
  parseId,
  projectAccess,
} from "@/lib/projects";
import { inviteOp } from "@/lib/task-ops";
import { requireUser } from "@/lib/session";
import { findUserById } from "@/lib/users";

export type InviteState = FormState & { results?: { email: string; ok: boolean; message: string; link?: string }[] };

async function origin() {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host");
  return host ? `${list.get("x-forwarded-proto") ?? "https"}://${host}` : undefined;
}

/** Egy vagy több meghívó; az e-mail-címek vesszővel, szóközzel vagy sortöréssel elválaszthatók. */
export async function inviteMembers(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  const role = String(formData.get("role") ?? "tag");
  const note = String(formData.get("note") ?? "").slice(0, 500);
  if (!isMemberRole(role)) return { error: "Érvénytelen szerep." };
  const emails = [...new Set(String(formData.get("emails") ?? "").split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 15);
  if (!emails.length) return { error: "Írd be legalább egy e-mail-címet." };

  const base = await origin();
  const results: NonNullable<InviteState["results"]> = [];
  for (const email of emails) {
    const result = await inviteOp(user, projectId, email, role, note, base);
    results.push(
      result.ok
        ? { email, ok: true, link: result.link, message: result.emailed ? "Meghívó elküldve." : "A levelet nem sikerült elküldeni, küldd el a linket kézzel." }
        : { email, ok: false, message: result.error },
    );
  }
  revalidatePath(`/projektek/${projectId}`);
  return { ok: results.some((item) => item.ok), results };
}

export async function revokeInvite(inviteId: string, projectId: string): Promise<FormState> {
  const user = await requireUser();
  const access = await projectAccess(user, projectId);
  const id = parseId(inviteId);
  if (!access || !id || !can.manage(access.role)) return { error: "Nincs jogosultságod." };
  await (await invitesCol()).updateOne({ _id: id, projectId: access.project._id, acceptedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  revalidatePath(`/projektek/${projectId}`);
  return { ok: true };
}

export async function changeMemberRole(projectId: string, userId: string, role: string): Promise<FormState> {
  const user = await requireUser();
  const access = await projectAccess(user, projectId);
  const target = parseId(userId);
  if (!access || !target || !can.manage(access.role)) return { error: "Nincs jogosultságod." };
  if (!isMemberRole(role)) return { error: "Érvénytelen szerep." };
  if (target.equals(access.project.ownerId)) return { error: "A projekt létrehozójának szerepe nem módosítható." };
  await (await membersCol()).updateOne({ projectId: access.project._id, userId: target }, { $set: { role } });
  const person = await findUserById(target);
  await logActivity(access.project._id, user.oid, `${user.name} ${person?.name ?? "a tag"} szerepét átállította: ${MEMBER_ROLES[role].label}`);
  revalidatePath(`/projektek/${projectId}`);
  return { ok: true };
}

export async function removeMember(projectId: string, userId: string): Promise<FormState> {
  const user = await requireUser();
  const access = await projectAccess(user, projectId);
  const target = parseId(userId);
  if (!access || !target) return { error: "Nincs jogosultságod." };
  const self = target.equals(user.oid);
  // Kiléphet bárki saját magától; mást a vezető távolíthat el. A létrehozó nem távolítható el.
  if (!self && !can.manage(access.role)) return { error: "Nincs jogosultságod." };
  if (target.equals(access.project.ownerId)) return { error: "A projekt létrehozója nem távolítható el." };
  const { tasksCol } = await import("@/lib/projects");
  await (await membersCol()).deleteOne({ projectId: access.project._id, userId: target });
  // A kilépett ember feladatai felelős nélkül maradnak, de nem vesznek el.
  await (await tasksCol()).updateMany({ projectId: access.project._id, assigneeId: target }, { $unset: { assigneeId: "" } });
  const person = await findUserById(target);
  await logActivity(access.project._id, user.oid, self ? `${user.name} kilépett a projektből` : `${user.name} eltávolította: ${person?.name ?? "egy tag"}`);
  revalidatePath(`/projektek/${projectId}`);
  return { ok: true };
}

/** Jelszó-visszaállító link egy taghoz (csak az adminisztrátor); a linket egyszer kapja meg. */
export async function memberResetLink(userId: string): Promise<{ error?: string; link?: string; email?: string }> {
  const user = await requireUser();
  if (!user.isAdmin) return { error: "Ezt csak az adminisztrátor teheti meg." };
  const id = parseId(userId);
  const target = id ? await findUserById(id) : null;
  if (!target) return { error: "A felhasználó nem található." };
  if (target.kind === "admin") return { error: "Adminisztrátor jelszavát az Elosztóból lehet visszaállítani." };
  const token = await issueLocalReset(target._id);
  return { link: `${!isPortal && PORTAL_URL ? PORTAL_URL : appBaseUrl(await origin())}/jelszo-visszaallitas?token=${token}`, email: target.email };
}
