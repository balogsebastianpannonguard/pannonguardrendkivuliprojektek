import "server-only";
import { cache } from "react";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { findUsersByIds, type UserKind } from "@/lib/users";
import type { CurrentUser } from "@/lib/session";

export * from "@/lib/project-meta";
import { type MemberRole, type ProjectStatus, type TaskPriority, type TaskStatus } from "@/lib/project-meta";

export type ProjectDocument = {
  _id: ObjectId;
  name: string;
  description: string;
  status: ProjectStatus;
  /** Opcionális cél- vagy határidő (ÉÉÉÉ-HH-NN). */
  dueDate?: string;
  /** Egy kis jelkép (emoji) a kártyára. */
  emoji: string;
  ownerId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type MemberDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  userId: ObjectId;
  role: MemberRole;
  addedBy: ObjectId;
  addedAt: Date;
};

export type TaskDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: ObjectId;
  dueDate?: string;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  doneAt?: Date;
};

export type CommentDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  taskId: ObjectId;
  authorId: ObjectId;
  text: string;
  createdAt: Date;
};

export type ActivityDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  userId?: ObjectId;
  /** Ha a változtatást Pajzsi hajtotta végre a felhasználó jóváhagyásával. */
  viaPajzsi?: boolean;
  text: string;
  at: Date;
};

export type InviteDocument = {
  _id: ObjectId;
  projectId: ObjectId;
  email: string;
  role: MemberRole;
  invitedBy: ObjectId;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
};

const db = async () => getDb();
export const projectsCol = async () => (await db()).collection<ProjectDocument>("projects");
export const membersCol = async () => (await db()).collection<MemberDocument>("members");
export const tasksCol = async () => (await db()).collection<TaskDocument>("tasks");
export const commentsCol = async () => (await db()).collection<CommentDocument>("comments");
export const activityCol = async () => (await db()).collection<ActivityDocument>("activity");
export const invitesCol = async () => (await db()).collection<InviteDocument>("project_invites");

export async function ensureIndexes() {
  const database = await db();
  await Promise.all([
    database.collection("members").createIndex({ projectId: 1, userId: 1 }, { unique: true }),
    database.collection("members").createIndex({ userId: 1 }),
    database.collection("tasks").createIndex({ projectId: 1, status: 1 }),
    database.collection("tasks").createIndex({ assigneeId: 1 }),
    database.collection("comments").createIndex({ taskId: 1, createdAt: 1 }),
    database.collection("activity").createIndex({ projectId: 1, at: -1 }),
    database.collection("project_invites").createIndex({ tokenHash: 1 }),
    database.collection("project_invites").createIndex({ projectId: 1 }),
    database.collection("project_invites").createIndex({ email: 1 }),
  ]);
}

export function parseId(value: string) {
  return /^[0-9a-f]{24}$/i.test(value) ? new ObjectId(value) : null;
}

/* ---------- Jogosultság ---------- */

/** A jogosultság központi szabályai; minden oldal és szerverművelet ezen át dönt. */
export const can = {
  view: (role: MemberRole | null) => role !== null,
  /** Feladat létrehozása, szerkesztése, kommentelés. */
  contribute: (role: MemberRole | null) => role === "vezeto" || role === "tag",
  /** Projekt módosítása, tagok kezelése, meghívás, feladat törlése. */
  manage: (role: MemberRole | null) => role === "vezeto",
};

export type Access = { project: ProjectDocument; role: MemberRole };

/** A felhasználó szerepe a projektben. Az adminisztrátor minden projektben vezető. */
export async function projectAccess(user: Pick<CurrentUser, "oid" | "isAdmin">, projectId: string | ObjectId): Promise<Access | null> {
  const id = typeof projectId === "string" ? parseId(projectId) : projectId;
  if (!id) return null;
  // A projekt és a tagság egyszerre kérdezhető le.
  const [project, member] = await Promise.all([(await projectsCol()).findOne({ _id: id }), user.isAdmin ? null : (await membersCol()).findOne({ projectId: id, userId: user.oid })]);
  if (!project) return null;
  if (user.isAdmin) return { project, role: "vezeto" };
  return member ? { project, role: member.role } : null;
}

export type ProjectSummary = {
  project: ProjectDocument;
  role: MemberRole;
  memberCount: number;
  total: number;
  done: number;
  overdue: number;
  mine: number;
};

/** Az `ÉÉÉÉ-HH-NN` mai napja budapesti idő szerint. */
export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(now);
}

export const isOverdue = (task: Pick<TaskDocument, "dueDate" | "status">, today = todayKey()) =>
  Boolean(task.dueDate && task.status !== "kesz" && task.dueDate < today);

/**
 * A felhasználó számára látható projektek összesítővel. Kérésenként egyszer számolódik (React `cache`), és az összesítést
 * az adatbázis végzi (csoportosítással), így nem kell a feladatokat egyenként áthozni.
 */
const projectSummaries = cache(async (userId: string, isAdmin: boolean): Promise<ProjectSummary[]> => {
  const userOid = new ObjectId(userId);
  const myMembers = await (await membersCol()).find({ userId: userOid }).toArray();
  const roleOf = new Map(myMembers.map((member) => [String(member.projectId), member.role]));

  const projects = await (await projectsCol())
    .find(isAdmin ? {} : { _id: { $in: myMembers.map((member) => member.projectId) } })
    .sort({ updatedAt: -1 })
    .toArray();
  if (!projects.length) return [];

  const ids = projects.map((project) => project._id);
  const today = todayKey();
  const [memberRows, taskRows] = await Promise.all([
    (await membersCol()).aggregate<{ _id: ObjectId; count: number }>([{ $match: { projectId: { $in: ids } } }, { $group: { _id: "$projectId", count: { $sum: 1 } } }]).toArray(),
    (await tasksCol())
      .aggregate<{ _id: ObjectId; total: number; done: number; overdue: number; mine: number }>([
        { $match: { projectId: { $in: ids } } },
        {
          $group: {
            _id: "$projectId",
            total: { $sum: 1 },
            done: { $sum: { $cond: [{ $eq: ["$status", "kesz"] }, 1, 0] } },
            overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "kesz"] }, { $lt: [{ $ifNull: ["$dueDate", "9999"] }, today] }] }, 1, 0] } },
            mine: { $sum: { $cond: [{ $and: [{ $ne: ["$status", "kesz"] }, { $eq: ["$assigneeId", userOid] }] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
  ]);
  const members = new Map(memberRows.map((row) => [String(row._id), row.count]));
  const stats = new Map(taskRows.map((row) => [String(row._id), row]));

  return projects.map((project) => {
    const row = stats.get(String(project._id));
    return {
      project,
      role: isAdmin ? "vezeto" : (roleOf.get(String(project._id)) ?? "megtekinto"),
      memberCount: members.get(String(project._id)) ?? 0,
      total: row?.total ?? 0,
      done: row?.done ?? 0,
      overdue: row?.overdue ?? 0,
      mine: row?.mine ?? 0,
    };
  });
});

export function listProjects(user: Pick<CurrentUser, "oid" | "isAdmin">) {
  return projectSummaries(String(user.oid), user.isAdmin);
}

export type MemberView = { userId: string; name: string; email: string; role: MemberRole; kind: UserKind; isOwner: boolean };

export async function listMembers(project: ProjectDocument): Promise<MemberView[]> {
  const rows = await (await membersCol())
    .aggregate<MemberDocument & { person?: { name: string; email: string; kind: UserKind } }>([
      { $match: { projectId: project._id } },
      { $sort: { addedAt: 1 } },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", pipeline: [{ $project: { name: 1, email: 1, kind: 1 } }], as: "person" } },
      { $set: { person: { $first: "$person" } } },
    ])
    .toArray();
  return rows.flatMap((row) =>
    row.person ? [{ userId: String(row.userId), name: row.person.name, email: row.person.email, role: row.role, kind: row.person.kind, isOwner: row.userId.equals(project.ownerId) }] : [],
  );
}

/** Tevékenységnapló-bejegyzés; a naplózás hibája nem akaszthat meg semmit. */
export async function logActivity(projectId: ObjectId, userId: ObjectId | undefined, text: string, viaPajzsi = false) {
  try {
    await (await activityCol()).insertOne({ _id: new ObjectId(), projectId, userId, text: text.slice(0, 300), at: new Date(), ...(viaPajzsi && { viaPajzsi }) });
  } catch (error) {
    console.error("Tevékenységnapló hiba:", (error as Error).name);
  }
}

/** A projektben hozzárendelhető emberek (azonosító → név). */
export async function memberNames(projectId: ObjectId) {
  const members = await (await membersCol()).find({ projectId }, { projection: { userId: 1 } }).toArray();
  const people = await findUsersByIds(members.map((member) => member.userId));
  return new Map(people.map((person) => [String(person._id), person.name]));
}
