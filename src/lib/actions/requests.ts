"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { DAY, longText, text, type FormState } from "@/lib/form";
import { MAX_PENDING_REQUESTS, ensureRequestIndexes, requestsCol } from "@/lib/project-requests";
import { ensureIndexes, logActivity, membersCol, parseId, projectsCol, type ProjectDocument } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { findUserById } from "@/lib/users";

function refreshAll(projectId?: ObjectId) {
  revalidatePath("/kervenyek");
  revalidatePath("/projektek");
  revalidatePath("/");
  if (projectId) revalidatePath(`/projektek/${projectId}`);
}

/** Projektindítás kérvényezése; csak nem admin felhasználónak (az admin közvetlenül létrehozhat projektet). */
export async function submitProjectRequest(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (user.isAdmin) return { error: "Adminisztrátorként közvetlenül létrehozhatsz projektet a Projektek oldalon." };
  const name = text(formData, "name", 100);
  const description = longText(formData, "description", 2000);
  const dueDate = String(formData.get("dueDate") ?? "");
  const emoji = String(formData.get("emoji") ?? "").trim().slice(0, 8) || "🚀";
  if (name.length < 3) return { error: "Adj a projektnek nevet (legalább 3 karakter)." };
  if (description.length < 10) return { error: "Írd le röviden, mi a cél és miért kell a projekt (legalább 10 karakter)." };
  if (dueDate && (!DAY.test(dueDate) || Number.isNaN(Date.parse(dueDate)))) return { error: "A határidő formátuma hibás." };

  await ensureRequestIndexes().catch(() => undefined);
  const collection = await requestsCol();
  if ((await collection.countDocuments({ requesterId: user.oid, status: "fuggo" })) >= MAX_PENDING_REQUESTS) {
    return { error: `Egyszerre legfeljebb ${MAX_PENDING_REQUESTS} elbírálatlan kérvényed lehet.` };
  }
  await collection.insertOne({ _id: new ObjectId(), requesterId: user.oid, name, description, emoji, ...(dueDate && { dueDate }), status: "fuggo", createdAt: new Date() });
  refreshAll();
  return { ok: true, message: "A kérvényt elküldtük, az adminisztrátor hamarosan elbírálja." };
}

/** A kérelmező visszavonja a még el nem bírált kérvényét. */
export async function withdrawRequest(requestId: string): Promise<FormState> {
  const user = await requireUser();
  const id = parseId(requestId);
  if (!id) return { error: "A kérvény nem található." };
  const done = await (await requestsCol()).findOneAndUpdate(
    { _id: id, requesterId: user.oid, status: "fuggo" },
    { $set: { status: "visszavonva", decidedAt: new Date() } },
  );
  if (!done) return { error: "A kérvény már nem vonható vissza." };
  refreshAll();
  return { ok: true };
}

/** Jóváhagyás: a kérelmezőnek projekt jön létre, ő lesz a projektvezető. Csak adminisztrátor. */
export async function approveRequest(requestId: string): Promise<FormState> {
  const admin = await requireUser();
  if (!admin.isAdmin) return { error: "Kérvényt csak az adminisztrátor bírálhat el." };
  const id = parseId(requestId);
  if (!id) return { error: "A kérvény nem található." };
  const collection = await requestsCol();

  const request = await collection.findOne({ _id: id });
  if (!request || request.status !== "fuggo") return { error: "Ezt a kérvényt már elbírálták." };
  const requester = await findUserById(request.requesterId);
  if (!requester || requester.disabledAt) return { error: "A kérelmező fiókja már nem aktív, a kérvény nem hagyható jóvá." };

  // Egyszeri elfogadás: két admin egyszerre sem hozhat létre két projektet.
  const claimed = await collection.findOneAndUpdate({ _id: id, status: "fuggo" }, { $set: { status: "jovahagyva", decidedAt: new Date(), decidedBy: admin.oid } }, { returnDocument: "after" });
  if (!claimed) return { error: "Ezt a kérvényt közben már elbírálták." };

  const now = new Date();
  const project: ProjectDocument = {
    _id: new ObjectId(),
    name: claimed.name,
    description: claimed.description,
    status: "aktiv",
    ...(claimed.dueDate && { dueDate: claimed.dueDate }),
    emoji: claimed.emoji,
    ownerId: claimed.requesterId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await ensureIndexes().catch(() => undefined);
    await (await projectsCol()).insertOne(project);
    await (await membersCol()).insertOne({ _id: new ObjectId(), projectId: project._id, userId: claimed.requesterId, role: "vezeto", addedBy: admin.oid, addedAt: now });
    await collection.updateOne({ _id: id }, { $set: { projectId: project._id } });
  } catch (error) {
    // Hiba esetén visszaállítjuk a kérvényt, hogy újra jóváhagyható legyen, és nem marad félkész projekt.
    console.error("Kérvény-jóváhagyási hiba:", (error as Error).name);
    await (await membersCol()).deleteMany({ projectId: project._id }).catch(() => undefined);
    await (await projectsCol()).deleteOne({ _id: project._id }).catch(() => undefined);
    await collection.updateOne({ _id: id }, { $set: { status: "fuggo" }, $unset: { decidedAt: "", decidedBy: "", projectId: "" } });
    return { error: "A jóváhagyás átmenetileg nem sikerült, próbáld újra." };
  }
  await logActivity(project._id, admin.oid, `${admin.name} jóváhagyta a projektindítást; projektvezető: ${requester.name}`);
  refreshAll(project._id);
  return { ok: true, message: `Jóváhagyva: ${requester.name} lett a projekt vezetője.` };
}

export async function rejectRequest(requestId: string, note: string): Promise<FormState> {
  const admin = await requireUser();
  if (!admin.isAdmin) return { error: "Kérvényt csak az adminisztrátor bírálhat el." };
  const id = parseId(requestId);
  if (!id) return { error: "A kérvény nem található." };
  const clean = String(note ?? "").trim().slice(0, 500);
  const done = await (await requestsCol()).findOneAndUpdate(
    { _id: id, status: "fuggo" },
    { $set: { status: "elutasitva", decidedAt: new Date(), decidedBy: admin.oid, ...(clean && { decisionNote: clean }) } },
  );
  if (!done) return { error: "Ezt a kérvényt már elbírálták." };
  refreshAll();
  return { ok: true, message: "Elutasítva." };
}
