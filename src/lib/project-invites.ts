import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { invitesCol, membersCol, projectsCol, type InviteDocument, type MemberRole, type ProjectDocument } from "@/lib/projects";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Új meghívó; a nyers token csak itt, egyszer látszik (az adatbázisban a hash-e van). */
export async function createInvite(project: ProjectDocument, email: string, role: MemberRole, invitedBy: ObjectId) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const collection = await invitesCol();
  // Ugyanarra a címre ugyanabba a projektbe csak egy nyitott meghívó él; az újabb a régit érvényteleníti.
  await collection.updateMany({ projectId: project._id, email, acceptedAt: { $exists: false }, revokedAt: { $exists: false } }, { $set: { revokedAt: now } });
  const doc: InviteDocument = {
    _id: new ObjectId(),
    projectId: project._id,
    email,
    role,
    invitedBy,
    tokenHash: hashToken(token),
    createdAt: now,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
  };
  await collection.insertOne(doc);
  return { token, invite: doc };
}

export type InviteCheck =
  | { status: "valid"; invite: InviteDocument; project: ProjectDocument }
  | { status: "invalid" | "expired" | "used" | "revoked" };

export async function checkInvite(token: string): Promise<InviteCheck> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { status: "invalid" };
  const invite = await (await invitesCol()).findOne({ tokenHash: hashToken(token) });
  if (!invite) return { status: "invalid" };
  if (invite.revokedAt) return { status: "revoked" };
  if (invite.acceptedAt) return { status: "used" };
  if (invite.expiresAt.getTime() <= Date.now()) return { status: "expired" };
  const project = await (await projectsCol()).findOne({ _id: invite.projectId });
  if (!project) return { status: "invalid" };
  return { status: "valid", invite, project };
}

/** Egyszeri beváltás: csak akkor sikerül, ha a meghívó még nyitott. */
export async function redeemInvite(inviteId: ObjectId) {
  return (await invitesCol()).findOneAndUpdate(
    { _id: inviteId, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { acceptedAt: new Date() } },
    { returnDocument: "after" },
  );
}

/** A felhasználó tagja lesz a projektnek (ha már az, a magasabb szerepet megtartja). */
export async function addMember(projectId: ObjectId, userId: ObjectId, role: MemberRole, addedBy: ObjectId) {
  const rank: Record<MemberRole, number> = { megtekinto: 0, tag: 1, vezeto: 2 };
  const members = await membersCol();
  const existing = await members.findOne({ projectId, userId });
  if (existing) {
    if (rank[role] > rank[existing.role]) await members.updateOne({ _id: existing._id }, { $set: { role } });
    return;
  }
  await members.insertOne({ _id: new ObjectId(), projectId, userId, role, addedBy, addedAt: new Date() });
}

/** A felhasználó e-mail-címére érkezett, még nyitott meghívók. */
export async function pendingInvitesFor(email: string) {
  const now = new Date();
  const invites = await (await invitesCol()).find({ email: email.toLowerCase(), acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: now } }).sort({ createdAt: -1 }).toArray();
  if (!invites.length) return [];
  const projects = await (await projectsCol()).find({ _id: { $in: invites.map((invite) => invite.projectId) } }).toArray();
  const byId = new Map(projects.map((project) => [String(project._id), project]));
  return invites.flatMap((invite) => {
    const project = byId.get(String(invite.projectId));
    return project ? [{ invite, project }] : [];
  });
}
